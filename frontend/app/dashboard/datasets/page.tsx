"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete } from "@/lib/auth-store"

interface Source { id: number; name: string; type: string }
interface Dataset {
  id: number; name: string; description: string; source_id: number
  sql: string; config: Record<string, unknown>; certified: boolean; updated_at: string
}
interface ColumnProfile {
  column: string; kind: string; nulls_pct: number; distinct: number
  min: number | null; max: number | null; mean: number | null; sample: string[]
}
interface Preview { columns: string[]; rows: unknown[][]; row_count: number; profile: ColumnProfile[] }

export default function DatasetsPage() {
  const token = useAuthStore((s) => s.token)
  const [mode, setMode] = useState<"list" | "build">("list")
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [editing, setEditing] = useState<Dataset | null>(null)

  const load = useCallback(() => {
    if (!token) return
    apiGet<Dataset[]>("/api/datasets", token).then(setDatasets).catch(() => {})
    apiGet<Source[]>("/api/sources", token).then(setSources).catch(() => {})
  }, [token])
  useEffect(() => { load() }, [load])

  const sourceName = (id: number) => sources.find((s) => s.id === id)?.name ?? `source #${id}`

  if (mode === "build") {
    return <DatasetBuilder token={token!} sources={sources} initial={editing}
      onDone={() => { setMode("list"); setEditing(null); load() }} />
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Datasets</h1>
          <p className="text-slate-400 text-sm mt-0.5">Reusable SQL views over your sources — preview, profile &amp; certify them</p>
        </div>
        <button onClick={() => { setEditing(null); setMode("build") }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New dataset
        </button>
      </div>

      {datasets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(37,99,235,0.07)" }}>
            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-700 font-semibold mb-1">No datasets yet</p>
          <p className="text-slate-400 text-sm mb-5 max-w-sm">Save a SQL query as a named dataset to reuse it across charts, dashboards, and AI — with column profiling and a certified badge.</p>
          <button onClick={() => setMode("build")}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            Create a dataset
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(37,99,235,0.07)" }}>
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-slate-900 font-semibold text-sm truncate">{d.name}</p>
                </div>
                {d.certified && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" title="Certified dataset">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4l2.3 2.29 6.3-6.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                    Certified
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs mb-3 line-clamp-2 min-h-[2rem]">{d.description || "No description"}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                {sourceName(d.source_id)}
              </div>
              <div className="flex gap-1 mt-auto pt-2 border-t border-slate-50">
                <button onClick={() => { setEditing(d); setMode("build") }}
                  className="text-[11px] font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg">Open</button>
                <button onClick={async () => {
                  if (!confirm(`Delete dataset "${d.name}"?`)) return
                  await apiDelete(`/api/datasets/${d.id}`, token!)
                  load()
                }} className="text-[11px] font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg ml-auto">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Builder ────────────────────────────────────────────────────
function DatasetBuilder({ token, sources, initial, onDone }: {
  token: string; sources: Source[]; initial: Dataset | null; onDone: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [certified, setCertified] = useState(initial?.certified ?? false)
  const [sourceId, setSourceId] = useState<number | null>(initial?.source_id ?? null)
  const [sql, setSql] = useState(initial?.sql ?? "SELECT * FROM ")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"data" | "columns">("data")

  useEffect(() => {
    if (sourceId == null && sources.length > 0) setSourceId(sources[0].id)
  }, [sources, sourceId])

  const run = useCallback(async () => {
    if (!sourceId || !sql.trim()) return
    setLoading(true); setError("")
    try {
      const r = await apiPost<Preview>("/api/datasets/preview", { source_id: sourceId, sql }, token)
      setPreview(r)
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : "Preview failed")
    } finally { setLoading(false) }
  }, [token, sourceId, sql])

  async function save() {
    if (!name.trim()) { setError("Give the dataset a name"); return }
    if (!sourceId) { setError("Pick a data source"); return }
    setSaving(true); setError("")
    const body = { name, description, source_id: sourceId, sql, certified, config: initial?.config ?? {} }
    try {
      if (initial) await apiPut(`/api/datasets/${initial.id}`, body, token)
      else await apiPost("/api/datasets", body, token)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally { setSaving(false) }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 bg-white"

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onDone} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled dataset"
          className="text-lg font-bold text-slate-900 bg-transparent outline-none placeholder-slate-300 flex-1" />
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
          <input type="checkbox" className="w-3.5 h-3.5 rounded accent-emerald-600" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
          Certified
        </label>
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
          {saving ? "Saving…" : initial ? "Update dataset" : "Save dataset"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        {/* Left: definition */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Definition</p>
            <select value={sourceId ?? ""} onChange={(e) => setSourceId(Number(e.target.value))} className={inputCls}>
              {sources.length === 0 && <option value="">No sources — add one first</option>}
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={8} spellCheck={false}
              className={`${inputCls} font-mono text-xs resize-y`}
              placeholder="SELECT order_id, region, amount, created_at FROM orders" />
            <button onClick={run} disabled={loading || !sourceId}
              className="w-full py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {loading ? "Running…" : "Run preview ▶"}
            </button>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className={`${inputCls} text-xs resize-y`} placeholder="Describe what this dataset contains (optional)" />
          </div>
          <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              A dataset is a saved, read-only query. Aggregate or clean your data once here, then reuse it as a trusted
              starting point. Mark it <b className="text-emerald-700">Certified</b> once it&apos;s production-ready.
            </p>
          </div>
        </div>

        {/* Right: preview + profile */}
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col min-h-[520px]">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(["data", "columns"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    tab === t ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
                  }`}>
                  {t === "data" ? "Data" : "Columns"}
                </button>
              ))}
            </div>
            {preview && <span className="text-[11px] text-slate-400">{preview.row_count.toLocaleString()} rows · {preview.columns.length} columns</span>}
          </div>

          <div className="flex-1 overflow-auto p-2">
            {error ? (
              <div className="m-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
            ) : !preview ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 text-sm gap-2">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Run a preview to see data and column stats
              </div>
            ) : tab === "data" ? (
              <DataGrid preview={preview} />
            ) : (
              <ProfileView profile={preview.profile} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DataGrid({ preview }: { preview: Preview }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 bg-slate-50">
        <tr>
          {preview.columns.map((c) => (
            <th key={c} className="text-left font-semibold text-slate-600 px-3 py-2 border-b border-slate-200 whitespace-nowrap">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {preview.rows.map((r, i) => (
          <tr key={i} className="hover:bg-slate-50/60">
            {r.map((cell, j) => (
              <td key={j} className="px-3 py-1.5 border-b border-slate-50 text-slate-600 whitespace-nowrap max-w-xs truncate">
                {cell === null ? <span className="text-slate-300 italic">null</span> : String(cell)}
              </td>
            ))}
          </tr>
        ))}
        {preview.rows.length === 0 && (
          <tr><td colSpan={preview.columns.length || 1} className="text-center text-slate-400 py-8">No rows</td></tr>
        )}
      </tbody>
    </table>
  )
}

function ProfileView({ profile }: { profile: ColumnProfile[] }) {
  const kindMeta: Record<string, { label: string; cls: string }> = {
    num: { label: "number", cls: "text-blue-700 bg-blue-50 border-blue-200" },
    time: { label: "time", cls: "text-purple-700 bg-purple-50 border-purple-200" },
    cat: { label: "text", cls: "text-slate-600 bg-slate-50 border-slate-200" },
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3 p-2">
      {profile.map((p) => {
        const m = kindMeta[p.kind] ?? kindMeta.cat
        return (
          <div key={p.column} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-mono text-xs font-semibold text-slate-800 truncate">{p.column}</span>
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-[11px] text-slate-500">
              <span>Distinct</span><span className="text-slate-700 text-right font-medium">{p.distinct.toLocaleString()}</span>
              <span>Nulls</span><span className={`text-right font-medium ${p.nulls_pct > 0 ? "text-amber-600" : "text-slate-700"}`}>{p.nulls_pct}%</span>
              {p.kind === "num" ? (
                <>
                  <span>Min</span><span className="text-slate-700 text-right font-medium">{fmt(p.min)}</span>
                  <span>Max</span><span className="text-slate-700 text-right font-medium">{fmt(p.max)}</span>
                  <span>Mean</span><span className="text-slate-700 text-right font-medium">{fmt(p.mean)}</span>
                </>
              ) : p.sample.length > 0 ? (
                <span className="col-span-2 mt-1 text-slate-400 truncate" title={p.sample.join(", ")}>e.g. {p.sample.join(", ")}</span>
              ) : null}
            </div>
          </div>
        )
      })}
      {profile.length === 0 && <p className="text-slate-400 text-sm p-4">No columns to profile.</p>}
    </div>
  )
}

function fmt(v: number | null): ReactNode {
  if (v === null || v === undefined) return "—"
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}
