"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore, apiGet, apiPost, apiDelete } from "@/lib/auth-store"

const PlotlyChart = dynamic(() => import("@/components/plotly-chart"), {
  ssr: false,
  loading: () => <div className="w-full h-64 bg-slate-50 animate-pulse rounded-lg" />,
})

interface Source { id: number; name: string; type: string }
interface Figure { data: unknown[]; layout: Record<string, unknown> }
interface AskResponse {
  sql: string; columns: string[]; rows: unknown[][]; row_count: number
  duration_ms: number; attempts: number; error: string | null
  chart_type: string; chart_config: Record<string, unknown>; figure: Figure | null
  usage_today: number | null; daily_limit: number | null
  example_id: number | null
  needs_clarification: boolean; clarifying_question: string | null
  question_text?: string  // client-side: the question that produced this answer
}
interface Settings { configured: boolean; use_own: boolean; platform_available: boolean; daily_limit: number }
interface ChatSessionItem { id: number; title: string; source_id: number | null; source_name: string | null; message_count: number; updated_at: string }

interface Msg {
  role: "user" | "assistant"
  question?: string
  response?: AskResponse
  pending?: boolean
  errorText?: string
  clarify?: string  // assistant asked a clarifying question
}

const SUGGESTIONS = [
  "How many rows are in each table?",
  "Show me the top 10 by the largest numeric column",
  "Count records grouped by category",
  "What's the total and average of the main metric?",
]

// Chart types offered in the chat switcher (all auto-configure from result shape)
const SWITCHABLE: { id: string; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "bar_horizontal", label: "Horizontal Bar" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "pie", label: "Pie" },
  { id: "donut", label: "Donut" },
  { id: "scatter", label: "Scatter" },
  { id: "histogram", label: "Histogram" },
  { id: "radar", label: "Radar" },
  { id: "metric", label: "KPI Number" },
  { id: "table", label: "Table only" },
]

interface PreviewResult {
  figure: Figure | null
  columns: string[]
  rows: unknown[][]
  row_count: number
  chart_type: string
}

export default function AIChatPage() {
  const token = useAuthStore((s) => s.token)
  const router = useRouter()

  const [sources, setSources] = useState<Source[]>([])
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [pendingClarify, setPendingClarify] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // AI dashboard builder
  const [buildOpen, setBuildOpen] = useState(false)
  const [buildTopic, setBuildTopic] = useState("")
  const [buildPanels, setBuildPanels] = useState(6)
  const [building, setBuilding] = useState(false)
  const [buildErr, setBuildErr] = useState("")

  async function buildDashboard() {
    if (!sourceId || building) return
    setBuilding(true); setBuildErr("")
    try {
      const r = await apiPost<{ dashboard_id: number; name: string; created: number; skipped: number }>(
        "/api/ai/build-dashboard",
        { source_id: sourceId, topic: buildTopic.trim(), panels: buildPanels }, token!)
      // open the new board straight away
      sessionStorage.setItem("dm_open_board", String(r.dashboard_id))
      router.push("/dashboard/boards")
    } catch (e) {
      setBuildErr(e instanceof Error ? e.message : "Couldn't build the dashboard")
      setBuilding(false)
    }
  }

  const loadSessions = useCallback(() => {
    if (!token) return
    apiGet<ChatSessionItem[]>("/api/chat/sessions", token).then(setSessions).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token) return
    apiGet<Source[]>("/api/sources", token).then((s) => {
      setSources(s)
      if (s.length) setSourceId(s[0].id)
    }).catch(() => {})
    apiGet<Settings>("/api/ai/settings", token).then(setSettings).catch(() => {})
    loadSessions()
  }, [token, loadSessions])

  // ── session helpers ──
  function newChat() {
    setMessages([]); setPendingClarify(null); setSessionId(null)
  }

  async function openSession(id: number) {
    if (!token) return
    try {
      const d = await apiGet<{ source_id: number | null; messages: { role: string; data: Msg }[] }>(`/api/chat/sessions/${id}`, token)
      setSessionId(id)
      setPendingClarify(null)
      if (d.source_id) setSourceId(d.source_id)
      setMessages(d.messages.map((m) => ({ ...m.data, role: m.role as Msg["role"] })))
    } catch {}
  }

  async function deleteSession(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!token || !confirm("Delete this chat?")) return
    await apiDelete(`/api/chat/sessions/${id}`, token)
    if (id === sessionId) newChat()
    loadSessions()
  }

  async function persist(sid: number, role: "user" | "assistant", data: object) {
    if (!token) return
    try { await apiPost(`/api/chat/sessions/${sid}/messages`, { role, data }, token) } catch {}
  }

  async function ensureSession(firstQuestion: string): Promise<number | null> {
    if (sessionId) return sessionId
    if (!token) return null
    try {
      const src = sources.find((s) => s.id === sourceId)
      const s = await apiPost<ChatSessionItem>("/api/chat/sessions",
        { source_id: sourceId, source_name: src?.name ?? null, title: firstQuestion.slice(0, 60) }, token)
      setSessionId(s.id)
      return s.id
    } catch { return null }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  async function ask(question: string) {
    if (!question.trim() || !sourceId || busy) return
    setInput("")
    // recent successful Q→SQL turns become conversation context for follow-ups
    const history = messages
      .filter((m) => m.role === "assistant" && m.response && !m.response.error && m.response.sql)
      .slice(-4)
      .map((m) => ({ question: m.response!.question_text ?? "", sql: m.response!.sql }))

    // if a clarification is pending, this message answers it — merge & don't re-clarify
    const answering = pendingClarify !== null
    const effectiveQuestion = answering ? `${pendingClarify}\n\nUser clarification: ${question}` : question

    setMessages((m) => [...m, { role: "user", question }, { role: "assistant", pending: true }])
    setBusy(true)
    // create/find the session and persist the user's message
    const sid = await ensureSession(question)
    if (sid) await persist(sid, "user", { role: "user", question })
    try {
      const r = await apiPost<AskResponse>("/api/ai/ask",
        { source_id: sourceId, question: effectiveQuestion, history, allow_clarify: !answering }, token!)

      if (r.needs_clarification) {
        setPendingClarify(effectiveQuestion)  // remember full context for the answer
        const am: Msg = { role: "assistant", clarify: r.clarifying_question ?? "Could you clarify?" }
        setMessages((m) => { const next = [...m]; next[next.length - 1] = am; return next })
        if (sid) await persist(sid, "assistant", am)
        loadSessions()
        return
      }

      setPendingClarify(null)
      r.question_text = effectiveQuestion
      const am: Msg = { role: "assistant", response: r }
      setMessages((m) => { const next = [...m]; next[next.length - 1] = am; return next })
      if (sid) await persist(sid, "assistant", am)
      loadSessions()
      if (r.usage_today != null && r.daily_limit != null) {
        setSettings((s) => s ? { ...s } : s)
      }
    } catch (e) {
      const am: Msg = { role: "assistant", errorText: e instanceof Error ? e.message : "Request failed" }
      setMessages((m) => { const next = [...m]; next[next.length - 1] = am; return next })
      if (sid) await persist(sid, "assistant", am)
      loadSessions()
    } finally {
      setBusy(false)
    }
  }

  const activeSource = sources.find((s) => s.id === sourceId)

  return (
    <div className="h-full flex gap-4">
      {/* ── Sessions sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <button onClick={newChat}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">History</p>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400 px-2 py-3">No past chats yet.</p>
          ) : sessions.map((s) => (
            <div key={s.id} onClick={() => openSession(s.id)}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                s.id === sessionId ? "bg-violet-50 text-violet-800" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="w-3.5 h-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs truncate flex-1" title={s.title}>{s.title}</span>
              <button onClick={(e) => deleteSession(s.id, e)} title="Delete chat"
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Chat column ── */}
      <div className="flex-1 max-w-4xl mx-auto h-full flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Ask AI</h1>
            <p className="text-[11px] text-slate-400">Ask questions in plain English — get SQL, data & charts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={newChat}
              className="flex md:hidden items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              New chat
            </button>
          )}
          <button onClick={() => { setBuildErr(""); setBuildOpen(true) }}
            disabled={!settings?.configured || !sourceId} title="Let AI build a whole dashboard"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
            Build dashboard
          </button>
          <select value={sourceId ?? ""} onChange={(e) => { setSourceId(Number(e.target.value)); newChat() }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 bg-white max-w-48">
            {sources.length === 0 && <option value="">No data sources</option>}
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* AI dashboard builder modal */}
      {buildOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !building && setBuildOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {building ? (
              <div className="flex flex-col items-center text-center py-6 gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse" style={{ background: "rgba(124,58,237,0.1)" }}>
                  <svg className="w-6 h-6 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                  </svg>
                </div>
                <p className="font-bold text-slate-900">Building your dashboard…</p>
                <p className="text-xs text-slate-400 max-w-xs">The AI is writing questions, generating SQL, running it, and charting each result. This can take ~20–40 seconds.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                  </svg>
                  <h2 className="text-lg font-bold text-slate-900">Build a dashboard with AI</h2>
                </div>
                <p className="text-xs text-slate-400 mb-4">AI defines the questions, builds the charts, and assembles a dashboard from <b>{activeSource?.name ?? "your data"}</b>.</p>
                <label className="block text-xs font-medium text-slate-600 mb-1">Topic / focus (optional)</label>
                <input value={buildTopic} onChange={(e) => setBuildTopic(e.target.value)}
                  placeholder="e.g. sales performance, customer overview…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-violet-400 mb-4"
                  onKeyDown={(e) => e.key === "Enter" && buildDashboard()} autoFocus />
                <label className="block text-xs font-medium text-slate-600 mb-1">Number of panels</label>
                <select value={buildPanels} onChange={(e) => setBuildPanels(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-violet-400 mb-4 bg-white">
                  {[4, 6, 8, 10].map((n) => <option key={n} value={n}>{n} panels</option>)}
                </select>
                {buildErr && <p className="text-xs text-red-500 mb-3">{buildErr}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setBuildOpen(false)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button onClick={buildDashboard} disabled={!sourceId}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}>Build it</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Not configured banner */}
      {settings && !settings.configured && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span>AI isn&apos;t configured yet. <Link href="/dashboard/settings" className="font-semibold underline">Add an API key in Settings</Link> to start asking.</span>
        </div>
      )}

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(124,58,237,0.08)" }}>
              <svg className="w-7 h-7 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
            </div>
            <div>
              <p className="text-slate-700 font-semibold">Ask anything about {activeSource?.name ?? "your data"}</p>
              <p className="text-slate-400 text-sm mt-1">The AI writes the SQL, runs it, and charts the answer.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-w-xl w-full">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} disabled={!settings?.configured || !sourceId}
                  className="text-left text-xs text-slate-600 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-colors disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} msg={m} token={token!} sourceId={sourceId} router={router} />)
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 pt-2">
        <form onSubmit={(e) => { e.preventDefault(); ask(input) }}
          className="flex items-end gap-2 bg-white rounded-2xl border border-slate-200 p-2 shadow-sm focus-within:border-violet-400 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input) } }}
            placeholder={settings?.configured ? "Ask a question…" : "Configure AI in Settings to start"}
            disabled={!settings?.configured || !sourceId}
            rows={1}
            className="flex-1 resize-none outline-none text-sm px-2 py-2 max-h-32 bg-transparent disabled:opacity-50"
          />
          <button type="submit" disabled={busy || !input.trim() || !settings?.configured}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40 transition-opacity"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            {busy ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
              </svg>
            )}
          </button>
        </form>
        {settings?.platform_available && !settings?.use_own && (
          <p className="text-[10px] text-slate-300 text-center mt-1.5">Using shared AI · {settings.daily_limit}/day limit · add your own key in Settings for unlimited</p>
        )}
      </div>
      </div>
    </div>
  )
}

// ── Message dispatcher (no hooks — picks the right view) ───────
function MessageBubble({ msg, token, sourceId, router }: {
  msg: Msg; token: string; sourceId: number | null
  router: ReturnType<typeof useRouter>
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
          {msg.question}
        </div>
      </div>
    )
  }

  if (msg.pending) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Thinking — writing SQL, running it, checking the result…
      </div>
    )
  }

  if (msg.errorText) {
    return (
      <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm max-w-[90%]">
        {msg.errorText}
      </div>
    )
  }

  if (msg.clarify) {
    return (
      <div className="flex items-start gap-2 max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-md bg-violet-50 border border-violet-200 text-violet-800 text-sm">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <p className="font-medium mb-0.5">Quick question first:</p>
          <p>{msg.clarify}</p>
          <p className="text-[11px] text-violet-400 mt-1.5">Type your answer below ↓</p>
        </div>
      </div>
    )
  }

  const r = msg.response
  if (!r) return null

  if (r.error) {
    return (
      <div className="bg-white rounded-2xl rounded-bl-md border border-slate-100 overflow-hidden max-w-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-50 text-[11px]">
          <span className="text-red-500 font-medium">Couldn&apos;t answer</span>
          {r.attempts > 1 && <span className="text-amber-500">· tried {r.attempts}×</span>}
        </div>
        <div className="px-4 py-3 text-sm text-slate-600">
          <p className="text-red-600 mb-1">The AI couldn&apos;t produce a working query after {r.attempts} tries.</p>
          <p className="text-xs text-slate-400 font-mono break-all">{r.error}</p>
          {r.sql && <pre className="mt-2 px-3 py-2 bg-slate-50 rounded-lg text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">{r.sql}</pre>}
        </div>
      </div>
    )
  }

  // success → mount the interactive card (fresh, with the real answer)
  return <AnswerCard r={r} token={token} sourceId={sourceId} router={router} />
}

// ── Interactive answer card (mounts only once the answer exists) ──
function AnswerCard({ r, token, sourceId, router }: {
  r: AskResponse; token: string; sourceId: number | null
  router: ReturnType<typeof useRouter>
}) {
  // open on the chart when one exists, otherwise the table
  const [tab, setTab] = useState<"chart" | "table" | "sql">(r.figure ? "chart" : "table")
  const [chartType, setChartType] = useState(r.chart_type || "table")
  const [sqlDraft, setSqlDraft] = useState(r.sql)
  const [figure, setFigure] = useState<Figure | null>(r.figure)
  const [columns, setColumns] = useState<string[]>(r.columns)
  const [rows, setRows] = useState<unknown[][]>(r.rows)
  const [rowCount, setRowCount] = useState(r.row_count)
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState("")
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)

  async function sendFeedback(rating: "up" | "down") {
    if (!r.example_id || feedback) return
    setFeedback(rating)
    try {
      await apiPost("/api/ai/feedback", { example_id: r.example_id, rating }, token)
    } catch { /* non-blocking */ }
  }

  // Re-run a SQL + chart-type combination via the chart preview endpoint
  async function rerun(sql: string, type: string) {
    if (!sourceId) return
    setBusy(true); setLocalErr("")
    try {
      const res = await apiPost<PreviewResult>("/api/charts/preview",
        { source_id: sourceId, sql, chart_type: type, config: {} }, token)
      setFigure(res.figure); setColumns(res.columns); setRows(res.rows)
      setRowCount(res.row_count); setChartType(type)
      if (type === "table") setTab("table")
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Failed to run")
    } finally {
      setBusy(false)
    }
  }

  function changeChartType(type: string) {
    setChartType(type)
    rerun(sqlDraft, type)
  }

  function pinToChart() {
    sessionStorage.setItem("dm_pin", JSON.stringify({ source_id: sourceId, sql: sqlDraft }))
    router.push("/dashboard/charts")
  }

  const noRows = rows.length === 0
  const TABS: ("chart" | "table" | "sql")[] = ["chart", "table", "sql"]

  return (
    <div className="bg-white rounded-2xl rounded-bl-md border border-slate-100 overflow-hidden max-w-full">
      {/* meta + tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              tab === t ? "text-blue-700" : "text-slate-400 hover:text-slate-700"
            }`}
            style={tab === t ? { background: "rgba(37,99,235,0.07)" } : {}}>
            {t === "sql" ? "SQL" : t}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400 px-2">
          {rowCount} rows{r.attempts > 1 && <span className="text-amber-500"> · self-corrected</span>}
        </span>
        {/* feedback */}
        {r.example_id && (
          feedback ? (
            <span className="text-[11px] text-slate-400 px-1">{feedback === "up" ? "✓ thanks" : "noted"}</span>
          ) : (
            <span className="flex items-center gap-0.5 px-1">
              <button onClick={() => sendFeedback("up")} title="Good answer — remember it"
                className="text-sm hover:scale-110 transition-transform opacity-60 hover:opacity-100">👍</button>
              <button onClick={() => sendFeedback("down")} title="Wrong answer — forget it"
                className="text-sm hover:scale-110 transition-transform opacity-60 hover:opacity-100">👎</button>
            </span>
          )
        )}
        {!noRows && (
          <button onClick={pinToChart} className="text-[11px] text-violet-500 hover:underline px-2">📊 Pin</button>
        )}
      </div>

      {localErr && <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{localErr}</div>}

      {/* ── CHART tab ── */}
      {tab === "chart" && (
        <div>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-50">
            <span className="text-[11px] text-slate-400">Chart type</span>
            <select value={chartType} onChange={(e) => changeChartType(e.target.value)} disabled={busy}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-blue-400 bg-white">
              {SWITCHABLE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {busy && <span className="text-[11px] text-slate-400">updating…</span>}
          </div>
          <div className="p-2">
            {chartType === "table" ? (
              <p className="text-xs text-slate-400 px-2 py-8 text-center">Chart hidden — see the Table tab.</p>
            ) : figure ? (
              <PlotlyChart figure={figure} className="w-full h-72" />
            ) : (
              <p className="text-xs text-slate-400 px-2 py-8 text-center">No chart for this result.</p>
            )}
          </div>
        </div>
      )}

      {/* ── TABLE tab ── */}
      {tab === "table" && (
        noRows ? (
          <div className="px-4 py-6 text-sm text-slate-400">Query returned no rows.</div>
        ) : (
          <div className="overflow-x-auto max-h-80">
            <table className="text-xs w-full">
              <thead className="sticky top-0 bg-slate-50">
                <tr>{columns.map((c) => <th key={c} className="text-left font-semibold text-slate-600 px-3 py-2 whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-50">
                    {(row as unknown[]).map((v, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-slate-700 font-mono whitespace-nowrap max-w-xs truncate">
                        {v === null ? <span className="text-slate-300 italic">null</span> : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="text-[10px] text-slate-400 px-3 py-1.5">showing 100 of {rowCount} rows</p>}
          </div>
        )
      )}

      {/* ── SQL tab (editable) ── */}
      {tab === "sql" && (
        <div className="p-3">
          <textarea value={sqlDraft} onChange={(e) => setSqlDraft(e.target.value)}
            spellCheck={false} rows={Math.min(10, sqlDraft.split("\n").length + 1)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono text-[12px] text-slate-700 outline-none focus:border-blue-400 resize-y bg-slate-50" />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => rerun(sqlDraft, chartType)} disabled={busy || !sqlDraft.trim()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
              {busy ? "Running…" : "▶ Run edited SQL"}
            </button>
            {sqlDraft !== r.sql && (
              <button onClick={() => setSqlDraft(r.sql)} className="text-xs text-slate-400 hover:text-slate-700">Reset to AI&apos;s SQL</button>
            )}
            <span className="ml-auto text-[10px] text-slate-300">read-only queries only</span>
          </div>
        </div>
      )}
    </div>
  )
}
