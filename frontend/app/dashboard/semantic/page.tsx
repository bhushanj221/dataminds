"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete } from "@/lib/auth-store"

interface Source { id: number; name: string; type: string }
interface ColumnInfo { name: string; type: string }
interface TableInfo { name: string; schema_name: string | null; columns: ColumnInfo[] }
interface Metric { id: number; name: string; description: string | null; table_name: string; expression: string; verified: boolean }
interface Glossary { term: string; definition: string }
interface SemanticData {
  source_id: number
  tables: Record<string, string>
  columns: Record<string, string>
  glossary: Glossary[]
  metrics: Metric[]
}
interface Suggestion {
  tables: Record<string, string>
  columns: Record<string, string>
  glossary: { term: string; definition: string }[]
  metrics: { name: string; description?: string; table: string; expression: string }[]
}

export default function SemanticPage() {
  const token = useAuthStore((s) => s.token)
  const [sources, setSources] = useState<Source[]>([])
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [schema, setSchema] = useState<TableInfo[]>([])
  const [tab, setTab] = useState<"descriptions" | "metrics" | "glossary">("descriptions")

  const [tableDesc, setTableDesc] = useState<Record<string, string>>({})
  const [colDesc, setColDesc] = useState<Record<string, string>>({})
  const [glossary, setGlossary] = useState<Glossary[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [suggestedMetrics, setSuggestedMetrics] = useState<Suggestion["metrics"]>([])

  const [booting, setBooting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!token) return
    apiGet<Source[]>("/api/sources", token).then((s) => {
      setSources(s)
      if (s.length) setSourceId(s[0].id)
    }).catch(() => {})
  }, [token])

  const load = useCallback(async () => {
    if (!token || !sourceId) return
    setMsg(""); setSuggestedMetrics([])
    const [sch, sem] = await Promise.all([
      apiGet<{ tables: TableInfo[] }>(`/api/sources/${sourceId}/schema`, token).catch(() => ({ tables: [] })),
      apiGet<SemanticData>(`/api/semantic/${sourceId}`, token).catch(() => null),
    ])
    setSchema(sch.tables)
    setTableDesc(sem?.tables ?? {})
    setColDesc(sem?.columns ?? {})
    setGlossary(sem?.glossary ?? [])
    setMetrics(sem?.metrics ?? [])
  }, [token, sourceId])

  useEffect(() => { load() }, [load])

  async function bootstrap() {
    if (!sourceId) return
    setBooting(true); setMsg("")
    try {
      const s = await apiPost<Suggestion>(`/api/semantic/${sourceId}/bootstrap`, {}, token!)
      // merge suggestions into the editable descriptions (don't overwrite existing edits)
      setTableDesc((cur) => ({ ...s.tables, ...cur }))
      setColDesc((cur) => ({ ...s.columns, ...cur }))
      setGlossary((cur) => cur.length ? cur : s.glossary)
      setSuggestedMetrics(s.metrics)
      setMsg(`AI suggested docs for ${Object.keys(s.tables).length} tables and ${s.metrics.length} metrics. Review, then Save.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bootstrap failed")
    } finally {
      setBooting(false)
    }
  }

  async function saveDoc() {
    if (!sourceId) return
    setSaving(true); setSaved(false)
    try {
      await apiPut(`/api/semantic/${sourceId}`, { tables: tableDesc, columns: colDesc, glossary }, token!)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function addMetric(m: { name: string; description?: string; table_name: string; expression: string }) {
    if (!sourceId) return
    try {
      const created = await apiPost<Metric>(`/api/semantic/${sourceId}/metrics`, m, token!)
      setMetrics((cur) => [...cur, created])
      setSuggestedMetrics((cur) => cur.filter((x) => x.name !== m.name))
      setMsg("")
      return true
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Metric failed verification")
      return false
    }
  }

  async function deleteMetric(id: number) {
    if (!sourceId) return
    await apiDelete(`/api/semantic/${sourceId}/metrics/${id}`, token!)
    setMetrics((cur) => cur.filter((m) => m.id !== id))
  }

  const inputCls = "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-400 bg-white"

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Semantic Layer</h1>
          <p className="text-slate-400 text-sm mt-0.5">Teach the AI your data&apos;s meaning — descriptions, verified metrics, glossary</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={sourceId ?? ""} onChange={(e) => setSourceId(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 bg-white">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={bootstrap} disabled={booting || !sourceId}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}>
            {booting ? "Generating…" : "✨ Auto-generate with AI"}
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">{msg}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(["descriptions", "metrics", "glossary"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t ? "text-blue-700" : "text-slate-500 hover:text-slate-800"
            }`}
            style={tab === t ? { background: "rgba(37,99,235,0.07)" } : {}}>
            {t}{t === "metrics" && metrics.length > 0 ? ` (${metrics.length})` : ""}
          </button>
        ))}
        {(tab === "descriptions" || tab === "glossary") && (
          <button onClick={saveDoc} disabled={saving}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
        )}
      </div>

      {/* ── Descriptions ── */}
      {tab === "descriptions" && (
        <div className="space-y-2">
          {schema.length === 0 && <p className="text-slate-400 text-sm">No tables — connect a source first.</p>}
          {schema.map((t) => {
            const open = expanded.has(t.name)
            return (
              <div key={t.name} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => {
                    const next = new Set(expanded)
                    open ? next.delete(t.name) : next.add(t.name)
                    setExpanded(next)
                  }} className="shrink-0">
                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                  <span className="font-mono text-sm font-semibold text-slate-800 shrink-0 w-32 truncate">{t.name}</span>
                  <input className={inputCls} placeholder="Describe this table…"
                    value={tableDesc[t.name] ?? ""}
                    onChange={(e) => setTableDesc({ ...tableDesc, [t.name]: e.target.value })} />
                </div>
                {open && (
                  <div className="px-4 pb-3 pl-11 space-y-1.5">
                    {t.columns.map((c) => {
                      const key = `${t.name}.${c.name}`
                      return (
                        <div key={c.name} className="flex items-center gap-3">
                          <span className="font-mono text-xs text-slate-500 shrink-0 w-28 truncate">{c.name}</span>
                          <input className={inputCls} placeholder={`Describe ${c.name}…`}
                            value={colDesc[key] ?? ""}
                            onChange={(e) => setColDesc({ ...colDesc, [key]: e.target.value })} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Metrics ── */}
      {tab === "metrics" && (
        <MetricsTab metrics={metrics} suggested={suggestedMetrics} schema={schema}
          onAdd={addMetric} onDelete={deleteMetric} />
      )}

      {/* ── Glossary ── */}
      {tab === "glossary" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
          {glossary.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${inputCls} w-48`} placeholder="term"
                value={g.term} onChange={(e) => {
                  const next = [...glossary]; next[i] = { ...g, term: e.target.value }; setGlossary(next)
                }} />
              <input className={inputCls} placeholder="definition"
                value={g.definition} onChange={(e) => {
                  const next = [...glossary]; next[i] = { ...g, definition: e.target.value }; setGlossary(next)
                }} />
              <button onClick={() => setGlossary(glossary.filter((_, j) => j !== i))}
                className="text-slate-300 hover:text-red-500 shrink-0 p-1">✕</button>
            </div>
          ))}
          <button onClick={() => setGlossary([...glossary, { term: "", definition: "" }])}
            className="text-xs font-medium text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg">+ Add term</button>
          {glossary.length === 0 && <p className="text-slate-400 text-sm">No glossary terms yet. Add business terms like &quot;active user&quot; → its definition.</p>}
        </div>
      )}
    </div>
  )
}

// ── Metrics tab ────────────────────────────────────────────────
function MetricsTab({ metrics, suggested, schema, onAdd, onDelete }: {
  metrics: Metric[]
  suggested: Suggestion["metrics"]
  schema: TableInfo[]
  onAdd: (m: { name: string; description?: string; table_name: string; expression: string }) => Promise<boolean | undefined>
  onDelete: (id: number) => void
}) {
  const [name, setName] = useState("")
  const [table, setTable] = useState("")
  const [expr, setExpr] = useState("")
  const [desc, setDesc] = useState("")
  const [adding, setAdding] = useState(false)

  const inputCls = "px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-400 bg-white"

  async function submit() {
    if (!name.trim() || !table || !expr.trim()) return
    setAdding(true)
    const ok = await onAdd({ name: name.trim(), description: desc.trim() || undefined, table_name: table, expression: expr.trim() })
    setAdding(false)
    if (ok) { setName(""); setExpr(""); setDesc("") }
  }

  return (
    <div className="space-y-4">
      {/* saved metrics */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {metrics.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">No metrics yet. Verified metrics are reused by the AI verbatim — define business logic once.</p>
        ) : metrics.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 shrink-0">✓ verified</span>
            <span className="font-mono text-sm font-semibold text-slate-800 shrink-0">{m.name}</span>
            <code className="text-xs text-slate-500 flex-1 truncate">{m.expression} <span className="text-slate-300">on {m.table_name}</span></code>
            {m.description && <span className="text-[11px] text-slate-400 truncate max-w-48">{m.description}</span>}
            <button onClick={() => onDelete(m.id)} className="text-slate-300 hover:text-red-500 shrink-0 p-1">✕</button>
          </div>
        ))}
      </div>

      {/* add metric */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Add metric</p>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} w-36`} placeholder="name (e.g. revenue)" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={inputCls} value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">table…</option>
            {schema.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <input className={`${inputCls} flex-1 min-w-48 font-mono`} placeholder="expression (e.g. SUM(amount))" value={expr} onChange={(e) => setExpr(e.target.value)} />
          <input className={`${inputCls} w-44`} placeholder="description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button onClick={submit} disabled={adding || !name.trim() || !table || !expr.trim()}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            {adding ? "Verifying…" : "Verify & add"}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">The expression is run against your database before saving — only working metrics are kept.</p>
      </div>

      {/* AI suggestions */}
      {suggested.length > 0 && (
        <div className="bg-white rounded-2xl border border-violet-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-3">✨ AI suggested</p>
          <div className="space-y-1.5">
            {suggested.map((s) => (
              <div key={s.name} className="flex items-center gap-3 text-xs">
                <span className="font-mono font-semibold text-slate-800 shrink-0">{s.name}</span>
                <code className="text-slate-500 flex-1 truncate">{s.expression} <span className="text-slate-300">on {s.table}</span></code>
                <button onClick={() => onAdd({ name: s.name, description: s.description, table_name: s.table, expression: s.expression })}
                  className="text-[11px] font-medium text-violet-600 hover:bg-violet-50 px-2.5 py-1 rounded-lg shrink-0">+ Add</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
