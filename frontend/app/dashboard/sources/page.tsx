"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthStore, apiGet, apiPost, apiDelete, apiUpload } from "@/lib/auth-store"
import { CATALOG, CATEGORIES, Connector } from "@/lib/connector-catalog"
import SchemaViewer from "@/components/schema-viewer"

// ── Types ──────────────────────────────────────────────────────
interface Source {
  id: number
  name: string
  type: string
  host: string | null
  port: number | null
  database: string
  username: string | null
  status: string
  created_at: string
  last_used_at: string | null
}

function DbIcon({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded-xl flex items-center justify-center shrink-0`}
      style={{ background: `${color}18`, width: size * 4, height: size * 4 }}>
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
      </svg>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function DataSourcesPage() {
  const token = useAuthStore((s) => s.token)

  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState("")

  const [modalOpen, setModalOpen] = useState(false)
  const [picked, setPicked] = useState<Connector | null>(null)

  const [schemaFor, setSchemaFor] = useState<Source | null>(null)

  const loadSources = useCallback(async () => {
    if (!token) return
    try {
      setSources(await apiGet<Source[]>("/api/sources", token))
      setPageError("")
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to load sources")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadSources() }, [loadSources])

  function openSchema(src: Source) {
    setSchemaFor(src)
  }

  async function removeSource(src: Source) {
    if (!confirm(`Delete connection "${src.name}"? This cannot be undone.`)) return
    await apiDelete(`/api/sources/${src.id}`, token!)
    if (schemaFor?.id === src.id) setSchemaFor(null)
    loadSources()
  }

  const [refreshing, setRefreshing] = useState<number | null>(null)
  async function refreshSource(src: Source) {
    setRefreshing(src.id)
    try {
      const r = await apiPost<{ success: boolean; message: string }>(`/api/sources/${src.id}/refresh`, {}, token!)
      if (!r.success) alert(r.message)
      loadSources()
    } finally {
      setRefreshing(null)
    }
  }

  const liveCount = CATALOG.filter((c) => c.available).length

  // Full-page schema explorer replaces the list when a source is opened
  if (schemaFor) {
    return <SchemaViewer source={schemaFor} token={token!} onBack={() => setSchemaFor(null)} />
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Data Sources</h1>
          <p className="text-slate-400 text-sm mt-0.5">{liveCount} connector types available — databases, warehouses, streaming SQL</p>
        </div>
        <button onClick={() => { setPicked(null); setModalOpen(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Add data source
        </button>
      </div>

      {pageError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{pageError}</div>
      )}

      {/* Connected sources */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : sources.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(37,99,235,0.07)" }}>
            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
            </svg>
          </div>
          <p className="text-slate-700 font-semibold mb-1">No data sources yet</p>
          <p className="text-slate-400 text-sm mb-5 max-w-sm">Connect your first database to start running queries and building dashboards.</p>
          <button onClick={() => { setPicked(null); setModalOpen(true) }}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            Connect a database
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {sources.map((src) => {
            const meta = CATALOG.find((c) => c.type === src.type)
            return (
              <div key={src.id} className="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md hover:border-blue-100 transition-all">
                <div className="flex items-start gap-3">
                  <DbIcon color={meta?.color ?? "#64748b"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-semibold text-sm truncate">{src.name}</p>
                    <p className="text-slate-400 text-xs truncate">
                      {src.host ? `${src.host}${src.port ? ":" + src.port : ""} / ${src.database}` : src.database}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        src.status === "connected" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${src.status === "connected" ? "bg-emerald-500" : "bg-red-500"}`} />
                        {src.status}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">{meta?.label ?? src.type}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                  <button onClick={() => openSchema(src)}
                    className="flex-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 transition-colors">
                    Browse schema
                  </button>
                  {(src.type === "gsheets" || src.type === "restapi") && (
                    <button onClick={() => refreshSource(src)} disabled={refreshing === src.id}
                      title="Re-fetch latest data"
                      className="text-xs font-medium text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                      {refreshing === src.id ? "…" : "Refresh"}
                    </button>
                  )}
                  <button onClick={() => removeSource(src)}
                    className="text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* Add source modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            {!picked ? (
              <CatalogPicker onPick={(c) => c.available && setPicked(c)} onClose={() => setModalOpen(false)} />
            ) : picked.type === "file" ? (
              <UploadForm connector={picked} token={token!} onBack={() => setPicked(null)}
                onSaved={() => { setModalOpen(false); loadSources() }} />
            ) : picked.type === "gsheets" ? (
              <GSheetForm connector={picked} token={token!} onBack={() => setPicked(null)}
                onSaved={() => { setModalOpen(false); loadSources() }} />
            ) : picked.type === "restapi" ? (
              <RestApiForm connector={picked} token={token!} onBack={() => setPicked(null)}
                onSaved={() => { setModalOpen(false); loadSources() }} />
            ) : (
              <ConnectionForm
                connector={picked}
                token={token!}
                onBack={() => setPicked(null)}
                onSaved={() => { setModalOpen(false); loadSources() }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Catalog picker (grouped by category) ───────────────────────
function CatalogPicker({ onPick, onClose }: {
  onPick: (c: Connector) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState("")
  const q = search.toLowerCase()
  const filtered = CATALOG.filter((c) => c.label.toLowerCase().includes(q) || c.type.includes(q))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Choose a data source</h2>
          <p className="text-xs text-slate-400 mt-0.5">{CATALOG.filter((c) => c.available).length} live connectors · more coming each wave</p>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <input
        type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search connectors… (postgres, snowflake, oracle…)"
        autoFocus
        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 mb-4"
      />
      {CATEGORIES.map((cat) => {
        const items = filtered.filter((c) => c.category === cat)
        if (items.length === 0) return null
        return (
          <div key={cat} className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{cat}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {items.map((c) => (
                <button key={c.type} onClick={() => onPick(c)} disabled={!c.available}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                    c.available
                      ? "border-slate-200 hover:border-blue-300 hover:shadow-sm cursor-pointer"
                      : "border-slate-100 opacity-45 cursor-not-allowed"
                  }`}>
                  <DbIcon color={c.color} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-800 leading-tight">{c.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{c.note}</p>
                  </div>
                  {!c.available && (
                    <span className="text-[8px] font-bold uppercase text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded shrink-0">Soon</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Dynamic connection form ────────────────────────────────────
function ConnectionForm({ connector, token, onBack, onSaved }: {
  connector: Connector
  token: string
  onBack: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    connector.fields.forEach((f) => { if (f.defaultValue) init[f.key] = f.defaultValue })
    return init
  })
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState("")

  const CORE_KEYS = new Set(["host", "port", "database", "username", "password"])

  function payload() {
    const core: Record<string, unknown> = { type: connector.type }
    const options: Record<string, string> = {}
    connector.fields.forEach((f) => {
      const v = values[f.key]?.trim()
      if (!v) return
      if (f.isOption || !CORE_KEYS.has(f.key)) options[f.key] = v
      else if (f.key === "port") core.port = parseInt(v)
      else core[f.key] = v
    })
    if (Object.keys(options).length) core.options = options
    return core
  }

  function missingRequired() {
    return connector.fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.label)
  }

  async function handleTest() {
    const missing = missingRequired()
    if (missing.length) { setError(`Required: ${missing.join(", ")}`); return }
    setTesting(true); setTestResult(null); setError("")
    try {
      const r = await apiPost<{ success: boolean; latency_ms: number | null; message: string }>(
        "/api/sources/test", payload(), token)
      setTestResult({ ok: r.success, msg: r.message })
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Test failed" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError("Give this connection a name"); return }
    const missing = missingRequired()
    if (missing.length) { setError(`Required: ${missing.join(", ")}`); return }
    setSaving(true); setError("")
    try {
      await apiPost("/api/sources", { name: name.trim(), ...payload() }, token)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-1 text-slate-400 hover:text-slate-700 rounded">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <DbIcon color={connector.color} />
        <div>
          <h2 className="text-lg font-bold text-slate-900">Connect {connector.label}</h2>
          <p className="text-xs text-slate-400">{connector.note}</p>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Connection name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder={`My ${connector.label}`} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {connector.fields.map((f) => {
            const wide = f.inputType === "textarea" || f.key === "host" || f.key === "s3_staging_dir" || f.key === "http_path"
            return (
              <div key={f.key} className={wide ? "col-span-2" : ""}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                {f.inputType === "textarea" ? (
                  <textarea className={`${inputCls} font-mono text-xs h-28 resize-y`}
                    value={values[f.key] ?? ""} placeholder={f.placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                ) : (
                  <input className={inputCls}
                    type={f.inputType ?? "text"}
                    value={values[f.key] ?? ""} placeholder={f.placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                )}
                {f.hint && <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>}
              </div>
            )
          })}
        </div>
      </div>

      {testResult && (
        <div className={`mt-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
          testResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                        : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {testResult.ok ? (
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          )}
          <span className="break-all">{testResult.msg}</span>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button onClick={handleTest} disabled={testing}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
          {saving ? "Saving…" : "Save connection"}
        </button>
      </div>
    </div>
  )
}

// ── Shared bits for ingest forms ───────────────────────────────
interface IngestFormProps {
  connector: Connector
  token: string
  onBack: () => void
  onSaved: () => void
}

const ingestInputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

function FormHeader({ connector, onBack }: { connector: Connector; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <button onClick={onBack} className="p-1 text-slate-400 hover:text-slate-700 rounded">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <DbIcon color={connector.color} />
      <div>
        <h2 className="text-lg font-bold text-slate-900">Connect {connector.label}</h2>
        <p className="text-xs text-slate-400">{connector.note}</p>
      </div>
    </div>
  )
}

function ResultBanner({ result }: { result: { ok: boolean; msg: string } | null }) {
  if (!result) return null
  return (
    <div className={`mt-4 px-4 py-3 rounded-xl text-sm ${
      result.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-red-50 border border-red-200 text-red-700"
    }`}>
      {result.msg}
    </div>
  )
}

// ── CSV / Excel / JSON / Parquet upload ────────────────────────
function UploadForm({ connector, token, onBack, onSaved }: IngestFormProps) {
  const [name, setName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function pickFile(f: File | null) {
    setFile(f)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""))
  }

  async function handleSave() {
    if (!file) { setResult({ ok: false, msg: "Choose a file first" }); return }
    if (!name.trim()) { setResult({ ok: false, msg: "Give this dataset a name" }); return }
    setSaving(true); setResult(null)
    try {
      const fd = new FormData()
      fd.append("name", name.trim())
      fd.append("file", file)
      const r = await apiUpload<{ table: string; row_count: number; column_count: number }>(
        "/api/sources/upload", fd, token)
      setResult({ ok: true, msg: `Imported ${r.row_count} rows × ${r.column_count} columns into table "${r.table}"` })
      setTimeout(onSaved, 900)
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Upload failed" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <FormHeader connector={connector} onBack={onBack} />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Dataset name</label>
          <input className={ingestInputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Q2 Sales Data" />
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0] ?? null) }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"
          }`}>
          {file ? (
            <div>
              <p className="text-slate-800 font-semibold text-sm">{file.name}</p>
              <p className="text-slate-400 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              <button onClick={() => pickFile(null)} className="text-xs text-red-500 hover:underline mt-2">Remove</button>
            </div>
          ) : (
            <div>
              <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              <p className="text-slate-500 text-sm">Drag &amp; drop your file here, or</p>
              <label className="inline-block mt-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors">
                browse files
                <input type="file" className="hidden"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.jsonl,.ndjson,.parquet"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
              <p className="text-slate-300 text-[11px] mt-3">CSV · TSV · Excel · JSON · Parquet — up to 200 MB</p>
            </div>
          )}
        </div>
      </div>

      <ResultBanner result={result} />

      <button onClick={handleSave} disabled={saving || !file}
        className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
        {saving ? "Importing…" : "Import file"}
      </button>
    </div>
  )
}

// ── Google Sheets ──────────────────────────────────────────────
function GSheetForm({ connector, token, onBack, onSaved }: IngestFormProps) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSave() {
    if (!name.trim() || !url.trim()) { setResult({ ok: false, msg: "Name and sheet URL are required" }); return }
    setSaving(true); setResult(null)
    try {
      const r = await apiPost<{ table: string; row_count: number; column_count: number }>(
        "/api/sources/gsheets", { name: name.trim(), url: url.trim() }, token)
      setResult({ ok: true, msg: `Imported ${r.row_count} rows × ${r.column_count} columns` })
      setTimeout(onSaved, 900)
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Import failed" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <FormHeader connector={connector} onBack={onBack} />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Dataset name</label>
          <input className={ingestInputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Marketing Budget Sheet" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Google Sheets link</label>
          <input className={ingestInputCls} value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…" />
          <p className="text-[11px] text-slate-400 mt-1.5">
            Share → &quot;Anyone with the link&quot; → Viewer. The current tab (gid) in the URL is imported.
            Use the Refresh button anytime to pull the latest data.
          </p>
        </div>
      </div>

      <ResultBanner result={result} />

      <button onClick={handleSave} disabled={saving}
        className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
        {saving ? "Importing…" : "Import sheet"}
      </button>
    </div>
  )
}

// ── REST API ───────────────────────────────────────────────────
function RestApiForm({ connector, token, onBack, onSaved }: IngestFormProps) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [authType, setAuthType] = useState("none")
  const [authToken, setAuthToken] = useState("")
  const [headerName, setHeaderName] = useState("X-API-Key")
  const [headerValue, setHeaderValue] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [jsonPath, setJsonPath] = useState("")
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleSave() {
    if (!name.trim() || !url.trim()) { setResult({ ok: false, msg: "Name and URL are required" }); return }
    setSaving(true); setResult(null)
    try {
      const body: Record<string, string> = { name: name.trim(), url: url.trim(), auth_type: authType }
      if (authType === "bearer") body.auth_token = authToken
      if (authType === "api_key") { body.header_name = headerName; body.header_value = headerValue }
      if (authType === "basic") { body.username = username; body.password = password }
      if (jsonPath.trim()) body.json_path = jsonPath.trim()
      const r = await apiPost<{ table: string; row_count: number; column_count: number }>(
        "/api/sources/restapi", body, token)
      setResult({ ok: true, msg: `Imported ${r.row_count} rows × ${r.column_count} columns` })
      setTimeout(onSaved, 900)
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Import failed" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <FormHeader connector={connector} onBack={onBack} />
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Dataset name</label>
          <input className={ingestInputCls} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Stripe Customers" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">API endpoint (GET, returns JSON)</label>
          <input className={ingestInputCls} value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1/customers" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Authentication</label>
            <select className={ingestInputCls} value={authType} onChange={(e) => setAuthType(e.target.value)}>
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="api_key">API key header</option>
              <option value="basic">Basic auth</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">JSON path <span className="text-slate-400 font-normal">(optional)</span></label>
            <input className={ingestInputCls} value={jsonPath} onChange={(e) => setJsonPath(e.target.value)}
              placeholder="data.items" />
          </div>
        </div>

        {authType === "bearer" && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Bearer token</label>
            <input type="password" className={ingestInputCls} value={authToken} onChange={(e) => setAuthToken(e.target.value)} />
          </div>
        )}
        {authType === "api_key" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Header name</label>
              <input className={ingestInputCls} value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Header value</label>
              <input type="password" className={ingestInputCls} value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} />
            </div>
          </div>
        )}
        {authType === "basic" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
              <input className={ingestInputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input type="password" className={ingestInputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <ResultBanner result={result} />

      <button onClick={handleSave} disabled={saving}
        className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
        {saving ? "Fetching…" : "Fetch & import"}
      </button>
    </div>
  )
}
