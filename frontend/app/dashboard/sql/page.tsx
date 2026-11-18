"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { sql as sqlLang } from "@codemirror/lang-sql"
import { githubLight } from "@uiw/codemirror-theme-github"
import { useAuthStore, apiGet, apiPost } from "@/lib/auth-store"

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="h-48 bg-slate-50 animate-pulse rounded-lg" />,
})

// ── Types ──────────────────────────────────────────────────────
interface Source { id: number; name: string; type: string; database: string; status: string }
interface ColumnInfo { name: string; type: string; nullable: boolean; primary_key: boolean }
interface TableInfo { name: string; schema_name: string | null; columns: ColumnInfo[] }
interface QueryResult { columns: string[]; rows: unknown[][]; row_count: number; duration_ms: number; truncated: boolean }
interface HistoryItem {
  id: number; source_id: number | null; source_name: string | null; sql: string
  status: string; error: string | null; row_count: number | null; duration_ms: number | null; created_at: string
}

const DEFAULT_SQL = "-- Select a data source, then write SQL\n-- Run with Ctrl+Enter\nSELECT * FROM "

export default function SqlEditorPage() {
  const token = useAuthStore((s) => s.token)
  const router = useRouter()

  const [sources, setSources] = useState<Source[]>([])
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [code, setCode] = useState(DEFAULT_SQL)
  const codeRef = useRef(code)
  codeRef.current = code

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState("")

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  // ── load sources ─────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    apiGet<Source[]>("/api/sources", token).then((s) => {
      setSources(s)
      if (s.length > 0) setSourceId(s[0].id)
    }).catch(() => {})
  }, [token])

  // ── load schema when source changes ──────────────────────────
  useEffect(() => {
    if (!token || !sourceId) { setTables([]); return }
    setSchemaLoading(true)
    apiGet<{ tables: TableInfo[] }>(`/api/sources/${sourceId}/schema`, token)
      .then((d) => setTables(d.tables))
      .catch(() => setTables([]))
      .finally(() => setSchemaLoading(false))
  }, [token, sourceId])

  const loadHistory = useCallback(() => {
    if (!token) return
    apiGet<HistoryItem[]>("/api/queries/history?limit=30", token).then(setHistory).catch(() => {})
  }, [token])

  useEffect(() => { if (showHistory) loadHistory() }, [showHistory, loadHistory])

  // ── schema-aware autocomplete ────────────────────────────────
  const sqlExtension = useMemo(() => {
    const schema: Record<string, string[]> = {}
    tables.forEach((t) => { schema[t.name] = t.columns.map((c) => c.name) })
    return sqlLang({ schema, upperCaseKeywords: true })
  }, [tables])

  // ── run query ────────────────────────────────────────────────
  const runQuery = useCallback(async () => {
    if (!token || !sourceId) { setQueryError("Connect and select a data source first"); return }
    const sqlText = codeRef.current.trim()
    if (!sqlText) return
    setRunning(true); setQueryError(""); setSortCol(null)
    try {
      const r = await apiPost<QueryResult>(`/api/sources/${sourceId}/query`, { sql: sqlText, limit: 1000 }, token)
      setResult(r)
    } catch (e) {
      setResult(null)
      setQueryError(e instanceof Error ? e.message : "Query failed")
    } finally {
      setRunning(false)
    }
  }, [token, sourceId])

  // Ctrl+Enter anywhere on the page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQuery() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [runQuery])

  // ── helpers ──────────────────────────────────────────────────
  function insertTable(name: string) {
    setCode((c) => c + (c.endsWith(" ") || c.endsWith("\n") ? "" : " ") + name)
  }

  function exportCsv() {
    if (!result) return
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [result.columns.map(esc).join(",")]
    result.rows.forEach((r) => lines.push(r.map(esc).join(",")))
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "query_result.csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sortedRows = useMemo(() => {
    if (!result || sortCol === null) return result?.rows ?? []
    return [...result.rows].sort((a, b) => {
      const x = a[sortCol], y = b[sortCol]
      if (x === null) return 1
      if (y === null) return -1
      if (typeof x === "number" && typeof y === "number") return sortAsc ? x - y : y - x
      return sortAsc ? String(x).localeCompare(String(y)) : String(y).localeCompare(String(x))
    })
  }, [result, sortCol, sortAsc])

  const activeSource = sources.find((s) => s.id === sourceId)

  return (
    <div className="h-full flex gap-4 -m-2">

      {/* ── Schema sidebar ── */}
      <aside className="w-60 shrink-0 bg-white rounded-2xl border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Data source</label>
          <select
            value={sourceId ?? ""}
            onChange={(e) => setSourceId(Number(e.target.value))}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 bg-white">
            {sources.length === 0 && <option value="">No sources connected</option>}
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {schemaLoading ? (
            <div className="space-y-1.5 p-1">{[1, 2, 3, 4].map((i) => <div key={i} className="h-7 rounded bg-slate-50 animate-pulse" />)}</div>
          ) : tables.length === 0 ? (
            <p className="text-slate-400 text-xs p-2">No tables. Connect a source in Data Sources.</p>
          ) : (
            tables.map((t) => {
              const key = `${t.schema_name ?? ""}.${t.name}`
              const open = expanded.has(key)
              return (
                <div key={key}>
                  <div className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 group">
                    <button
                      onClick={() => {
                        const next = new Set(expanded)
                        if (open) { next.delete(key) } else { next.add(key) }
                        setExpanded(next)
                      }}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                      <svg className={`w-2.5 h-2.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                      </svg>
                      <span className="text-xs text-slate-700 font-medium truncate">{t.name}</span>
                    </button>
                    <button onClick={() => insertTable(t.name)} title="Insert into editor"
                      className="opacity-0 group-hover:opacity-100 text-[9px] font-bold text-blue-500 hover:text-blue-700 shrink-0">
                      +INS
                    </button>
                  </div>
                  {open && (
                    <div className="ml-5 border-l border-slate-100 pl-2 mb-1">
                      {t.columns.map((c) => (
                        <div key={c.name} className="flex items-center gap-1.5 py-0.5 text-[11px]">
                          {c.primary_key && <span className="text-amber-500 text-[9px]">🔑</span>}
                          <span className="text-slate-600 font-mono truncate">{c.name}</span>
                          <span className="text-slate-300 font-mono text-[9px] truncate">{c.type.toLowerCase().slice(0, 12)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {/* Editor card */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
              </svg>
              <h1 className="text-sm font-bold text-slate-900">SQL Editor</h1>
              {activeSource && (
                <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100">
                  {activeSource.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowHistory(!showHistory)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  showHistory ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
                }`}>
                History
              </button>
              <button onClick={runQuery} disabled={running || !sourceId}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
                {running ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
                Run <kbd className="text-[9px] opacity-70">Ctrl+↵</kbd>
              </button>
            </div>
          </div>
          <CodeMirror
            value={code}
            height="220px"
            theme={githubLight}
            extensions={[sqlExtension]}
            onChange={(v) => setCode(v)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              autocompletion: true,
              highlightActiveLine: true,
            }}
          />
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="bg-white rounded-2xl border border-slate-100 max-h-56 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-xs font-bold text-slate-700">Recent queries</h2>
            </div>
            {history.length === 0 ? (
              <p className="text-slate-400 text-xs p-4">No queries yet.</p>
            ) : (
              history.map((h) => (
                <button key={h.id} onClick={() => { setCode(h.sql); setShowHistory(false) }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 transition-colors">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-[10px] text-slate-400">{h.source_name ?? "—"}</span>
                    <span className="text-[10px] text-slate-300">{new Date(h.created_at + "Z").toLocaleTimeString()}</span>
                    {h.row_count !== null && <span className="text-[10px] text-slate-400 ml-auto">{h.row_count} rows · {h.duration_ms}ms</span>}
                  </div>
                  <code className="text-[11px] text-slate-600 line-clamp-1">{h.sql}</code>
                </button>
              ))
            )}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col min-h-48">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold text-slate-700">Results</h2>
              {result && (
                <span className="text-[11px] text-slate-400">
                  {result.row_count} rows · {result.duration_ms}ms
                  {result.truncated && <span className="text-amber-500 ml-1">(truncated at 1000)</span>}
                </span>
              )}
            </div>
            {result && result.rows.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    sessionStorage.setItem("dm_pin", JSON.stringify({ source_id: sourceId, sql: codeRef.current.trim() }))
                    router.push("/dashboard/charts")
                  }}
                  className="text-[11px] font-medium text-violet-600 hover:bg-violet-50 px-2.5 py-1 rounded-lg transition-colors">
                  📊 Pin to chart
                </button>
                <button onClick={exportCsv}
                  className="text-[11px] font-medium text-blue-600 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors">
                  ↓ Export CSV
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {queryError ? (
              <div className="m-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono break-all">
                {queryError}
              </div>
            ) : !result ? (
              <div className="h-full flex items-center justify-center text-slate-300 text-sm p-8">
                Run a query to see results
              </div>
            ) : result.rows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm p-8">
                Query returned no rows
              </div>
            ) : (
              <table className="text-xs w-full">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50">
                    <th className="px-2 py-2 text-left text-slate-300 font-normal w-10 border-b border-slate-100">#</th>
                    {result.columns.map((c, i) => (
                      <th key={i}
                        onClick={() => {
                          if (sortCol === i) { setSortAsc(!sortAsc) } else { setSortCol(i); setSortAsc(true) }
                        }}
                        className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-100 cursor-pointer hover:text-blue-600 whitespace-nowrap select-none">
                        {c}
                        {sortCol === i && <span className="ml-1 text-blue-500">{sortAsc ? "↑" : "↓"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-blue-50/40 border-b border-slate-50">
                      <td className="px-2 py-1.5 text-slate-300">{ri + 1}</td>
                      {row.map((v, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-slate-700 font-mono whitespace-nowrap max-w-xs overflow-hidden text-ellipsis">
                          {v === null || v === undefined
                            ? <span className="text-slate-300 italic">null</span>
                            : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
