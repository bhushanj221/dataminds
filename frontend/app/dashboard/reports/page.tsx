"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete } from "@/lib/auth-store"

const API = process.env.NEXT_PUBLIC_API_URL ?? ""

interface Source { id: number; name: string; type: string }
interface Report {
  id: number; source_id: number; source_name: string | null; name: string
  description: string | null; sql: string; fmt: string; recipients: string | null
  frequency: number; enabled: boolean; last_status: string | null; last_error: string | null
  last_row_count: number | null; last_run_at: string | null; created_at: string
}
interface ReportRun {
  id: number; report_id: number; status: string; fmt: string | null; row_count: number | null
  duration_ms: number | null; recipients: string | null; delivered: boolean
  trigger: string | null; error: string | null; created_at: string
}

const FREQ_OPTIONS = [
  { label: "Manual only", value: 0 }, { label: "Hourly", value: 3600 },
  { label: "Every 6 hours", value: 21600 }, { label: "Daily", value: 86400 },
  { label: "Weekly", value: 604800 },
]
function freqLabel(s: number) { return FREQ_OPTIONS.find((f) => f.value === s)?.label ?? `every ${s}s` }
function timeAgo(iso: string | null): string {
  if (!iso) return "never"
  const diff = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function ReportsPage() {
  const token = useAuthStore((s) => s.token)
  const [sources, setSources] = useState<Source[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [modal, setModal] = useState<{ report: Report | null } | null>(null)
  const [historyFor, setHistoryFor] = useState<number | null>(null)
  const [runs, setRuns] = useState<ReportRun[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [toast, setToast] = useState("")

  const load = useCallback(() => {
    if (!token) return
    apiGet<Source[]>("/api/sources", token).then(setSources).catch(() => {})
    apiGet<Report[]>("/api/reports", token).then(setReports).catch(() => {})
  }, [token])
  useEffect(() => { load() }, [load])

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000) }

  async function runNow(r: Report) {
    if (!token) return
    setBusy(r.id)
    try {
      const run = await apiPost<ReportRun>(`/api/reports/${r.id}/run`, {}, token)
      flash(run.delivered ? `Sent to ${run.recipients}` : `Ran OK (${run.row_count} rows) — no email (configure SMTP & recipients)`)
      load(); if (historyFor === r.id) openHistory(r.id)
    } catch (e: any) { flash(e?.message || "Run failed") }
    finally { setBusy(null) }
  }

  async function download(r: Report) {
    if (!token) return
    setBusy(r.id)
    try {
      const res = await fetch(`${API}/api/reports/${r.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") || ""
      const m = cd.match(/filename\*=UTF-8''([^;]+)/)
      const fname = m ? decodeURIComponent(m[1]) : `${r.name}.${r.fmt === "excel" ? "xlsx" : "csv"}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
      load()
    } catch (e: any) { flash(e?.message || "Download failed") }
    finally { setBusy(null) }
  }

  async function openHistory(id: number) {
    if (!token) return
    setHistoryFor(id)
    try { setRuns(await apiGet<ReportRun[]>(`/api/reports/${id}/runs`, token)) } catch { setRuns([]) }
  }

  async function toggle(r: Report) {
    if (!token) return
    await apiPut(`/api/reports/${r.id}`, { enabled: !r.enabled }, token); load()
  }
  async function remove(r: Report) {
    if (!token || !confirm(`Delete report "${r.name}"?`)) return
    await apiDelete(`/api/reports/${r.id}`, token)
    if (historyFor === r.id) setHistoryFor(null)
    load()
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Schedule a query to run and email its results as CSV or Excel.</p>
        </div>
        <button onClick={() => setModal({ report: null })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Report
        </button>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">{toast}</div>
      )}

      {reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(37,99,235,0.07)" }}>
            <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <h3 className="font-semibold text-slate-800">No reports yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Create a report from any SQL query — download it on demand or have it emailed on a schedule.</p>
          <button onClick={() => setModal({ report: null })} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>Create your first report</button>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-5 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{r.name}</h3>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">{r.fmt}</span>
                    {r.enabled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{freqLabel(r.frequency)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Paused
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{r.source_name}</p>
                  <p className="text-xs text-slate-500 mt-2 font-mono truncate" title={r.sql}>{r.sql}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                    {r.last_status === "success" && <span className="text-emerald-600">✓ last run {timeAgo(r.last_run_at)} · {r.last_row_count} rows</span>}
                    {r.last_status === "error" && <span className="text-rose-600" title={r.last_error || ""}>✗ last run failed</span>}
                    {!r.last_status && <span>never run</span>}
                    {r.recipients && <span>· → {r.recipients}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => runNow(r)} disabled={busy === r.id}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {busy === r.id ? "…" : "Run now"}
                  </button>
                  <button onClick={() => download(r)} disabled={busy === r.id} title="Download now"
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button onClick={() => historyFor === r.id ? setHistoryFor(null) : openHistory(r.id)} title="History"
                    className={`p-1.5 rounded-lg ${historyFor === r.id ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                  <button onClick={() => toggle(r)} title={r.enabled ? "Pause schedule" : "Resume schedule"}
                    className={`relative w-8 rounded-full transition-colors ${r.enabled ? "bg-blue-500" : "bg-slate-300"}`} style={{ height: 18 }}>
                    <span className="absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all" style={{ left: r.enabled ? 14 : 2 }} />
                  </button>
                  <button onClick={() => setModal({ report: r })} title="Edit"
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => remove(r)} title="Delete"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              {/* history */}
              {historyFor === r.id && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Run history</p>
                  {runs.length === 0 ? (
                    <p className="text-xs text-slate-400">No runs yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {runs.map((run) => (
                        <div key={run.id} className="flex items-center gap-3 text-xs">
                          <span className={run.status === "success" ? "text-emerald-600" : "text-rose-600"}>
                            {run.status === "success" ? "✓" : "✗"}
                          </span>
                          <span className="text-slate-500 w-20">{timeAgo(run.created_at)}</span>
                          <span className="text-slate-400">{run.trigger}</span>
                          {run.status === "success"
                            ? <span className="text-slate-600">{run.row_count} rows{run.delivered ? ` · emailed ${run.recipients}` : " · downloaded"}</span>
                            : <span className="text-rose-600 truncate">{run.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && <ReportModal sources={sources} report={modal.report} token={token!}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}

// ── Create / edit modal ────────────────────────────────────────
const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"

function ReportModal({ sources, report, token, onClose, onSaved }:
  { sources: Source[]; report: Report | null; token: string; onClose: () => void; onSaved: () => void }) {
  const editing = !!report
  const [form, setForm] = useState({
    source_id: report?.source_id ?? sources[0]?.id ?? 0,
    name: report?.name ?? "", sql: report?.sql ?? "", description: report?.description ?? "",
    fmt: report?.fmt ?? "csv", recipients: report?.recipients ?? "",
    frequency: report?.frequency ?? 86400, enabled: report?.enabled ?? true,
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    setError("")
    if (!form.source_id || !form.name.trim() || !form.sql.trim()) { setError("Source, name and query are required."); return }
    setSaving(true)
    try {
      const body = {
        source_id: form.source_id, name: form.name, sql: form.sql, description: form.description || null,
        fmt: form.fmt, recipients: form.recipients || null, frequency: form.frequency, enabled: form.enabled,
      }
      if (editing) await apiPut(`/api/reports/${report!.id}`, body, token)
      else await apiPost("/api/reports", body, token)
      onSaved()
    } catch (e: any) { setError(e?.message || "Could not save report"); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900">{editing ? "Edit report" : "New report"}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Data source">
            <select value={form.source_id} onChange={(e) => set("source_id", Number(e.target.value))} className={inputCls}>
              {sources.length === 0 && <option value={0}>No sources — connect one first</option>}
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
            </select>
          </Field>
          <Field label="Report name">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Weekly Orders Export" className={inputCls} />
          </Field>
          <Field label="Query" hint="The SELECT whose result becomes the report (up to 50,000 rows).">
            <textarea value={form.sql} onChange={(e) => set("sql", e.target.value)} rows={3}
              placeholder="SELECT * FROM orders WHERE created_at >= now() - interval '7 days'"
              className={inputCls + " font-mono text-xs"} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <select value={form.fmt} onChange={(e) => set("fmt", e.target.value)} className={inputCls}>
                <option value="csv">CSV</option><option value="excel">Excel (.xlsx)</option>
              </select>
            </Field>
            <Field label="Schedule">
              <select value={form.frequency} onChange={(e) => set("frequency", Number(e.target.value))} className={inputCls}>
                {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Email recipients" hint="Comma-separated. Blank = default from Settings → Alert Notifications. Needs SMTP configured to deliver.">
            <input value={form.recipients} onChange={(e) => set("recipients", e.target.value)}
              placeholder="team@company.com, exec@company.com" className={inputCls} />
          </Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create report"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
