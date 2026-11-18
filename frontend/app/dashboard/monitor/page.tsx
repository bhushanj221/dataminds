"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete } from "@/lib/auth-store"

// ── types ──────────────────────────────────────────────────────
interface Source { id: number; name: string; type: string }
interface KPI {
  id: number; source_id: number; source_name: string | null; name: string
  description: string | null; sql: string; target_value: number | null
  direction: string; unit: string; threshold_green: number | null; threshold_yellow: number | null
  last_value: number | null; prev_value: number | null; last_status: string | null
  last_error: string | null; last_evaluated_at: string | null; pct_to_target: number | null
  alert_count: number; created_at: string
}
interface Alert {
  id: number; kpi_id: number; kpi_name: string | null; name: string; alert_type: string
  operator: string | null; threshold_value: number | null; pct_change: number | null
  check_frequency: number; cooldown: number; channels: string[]; webhook_url: string | null
  email_to: string | null; email_subject: string | null; email_body: string | null
  enabled: boolean; status: string; last_value: number | null
  last_checked_at: string | null; last_triggered_at: string | null; created_at: string
}
interface Notification {
  id: number; alert_id: number; kpi_id: number | null; alert_name: string | null
  kpi_name: string | null; message: string; value: number | null; status: string
  read: boolean; acknowledged: boolean; acknowledged_at: string | null
  acknowledged_comment: string | null; created_at: string
}

// ── formatting ─────────────────────────────────────────────────
function fmtValue(v: number | null, unit: string): string {
  if (v === null || v === undefined) return "—"
  const n = unit === "percent" ? v : v
  const s = Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : (n % 1 === 0 ? n.toString() : n.toFixed(2))
  if (unit === "currency") return "$" + s
  if (unit === "percent") return s + "%"
  return s
}
const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  green:   { bg: "#f0fdf4", text: "#15803d", dot: "#22c55e", label: "On track" },
  yellow:  { bg: "#fefce8", text: "#a16207", dot: "#eab308", label: "Warning" },
  red:     { bg: "#fef2f2", text: "#b91c1c", dot: "#ef4444", label: "Off track" },
  no_data: { bg: "#f8fafc", text: "#64748b", dot: "#94a3b8", label: "No data" },
  error:   { bg: "#fef2f2", text: "#b91c1c", dot: "#f87171", label: "Error" },
}
const ALERT_STATUS: Record<string, { text: string; bg: string }> = {
  ok: { text: "#15803d", bg: "#f0fdf4" },
  triggered: { text: "#b91c1c", bg: "#fef2f2" },
  no_data: { text: "#a16207", bg: "#fefce8" },
  error: { text: "#b91c1c", bg: "#fef2f2" },
}
const FREQ_OPTIONS = [
  { label: "Every 1 min", value: 60 }, { label: "Every 5 min", value: 300 },
  { label: "Every 15 min", value: 900 }, { label: "Every hour", value: 3600 },
  { label: "Daily", value: 86400 },
]
function timeAgo(iso: string | null): string {
  if (!iso) return "never"
  const diff = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function MonitorPage() {
  const token = useAuthStore((s) => s.token)
  const [sources, setSources] = useState<Source[]>([])
  const [kpis, setKpis] = useState<KPI[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [tab, setTab] = useState<"kpis" | "alerts" | "activity">("kpis")
  const [kpiModal, setKpiModal] = useState(false)
  const [alertModal, setAlertModal] = useState<{ kpi: KPI | null } | null>(null)
  const [alertFilter, setAlertFilter] = useState<"all" | "active" | "paused">("all")
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!token) return
    apiGet<Source[]>("/api/sources", token).then(setSources).catch(() => {})
    apiGet<KPI[]>("/api/kpis", token).then(setKpis).catch(() => {})
    apiGet<Alert[]>("/api/alerts", token).then(setAlerts).catch(() => {})
    apiGet<Notification[]>("/api/notifications", token).then(setNotifications).catch(() => {})
  }, [token])

  useEffect(() => { load() }, [load])

  async function evaluateKpi(id: number) {
    if (!token) return
    setBusy(id)
    try { await apiPost<KPI>(`/api/kpis/${id}/evaluate`, {}, token); load() }
    finally { setBusy(null) }
  }
  async function deleteKpi(id: number) {
    if (!token || !confirm("Delete this KPI and its alerts?")) return
    await apiDelete(`/api/kpis/${id}`, token); load()
  }
  async function checkAlert(id: number) {
    if (!token) return
    setBusy(id)
    try { await apiPost<Alert>(`/api/alerts/${id}/check`, {}, token); load() }
    finally { setBusy(null) }
  }
  async function toggleAlert(a: Alert) {
    if (!token) return
    await apiPut<Alert>(`/api/alerts/${a.id}`, { enabled: !a.enabled }, token); load()
  }
  async function deleteAlert(id: number) {
    if (!token || !confirm("Delete this alert?")) return
    await apiDelete(`/api/alerts/${id}`, token); load()
  }
  async function acknowledge(id: number) {
    if (!token) return
    const comment = prompt("Acknowledge — add a note (optional):") ?? ""
    await apiPost<Notification>(`/api/notifications/${id}/acknowledge`, { comment }, token); load()
  }

  const firingAlerts = alerts.filter((a) => a.enabled && (a.status === "triggered" || a.status === "no_data"))
  const triggeredCount = firingAlerts.length
  const activeCount = alerts.filter((a) => a.enabled).length
  const pausedCount = alerts.length - activeCount
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="max-w-7xl mx-auto">
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monitor</h1>
          <p className="text-slate-500 text-sm mt-1">Track KPIs and get alerted when metrics cross your thresholds.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setAlertModal({ kpi: null })}
            title="Create a new alert"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            New Alert
          </button>
          <button onClick={() => setKpiModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New KPI
          </button>
        </div>
      </div>

      {/* ── Active (firing) alerts banner — always visible across tabs ── */}
      {firingAlerts.length > 0 && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/60 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rose-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            <h2 className="text-sm font-semibold text-rose-800">
              {firingAlerts.length} active alert{firingAlerts.length > 1 ? "s" : ""} firing
            </h2>
            <button onClick={() => setTab("activity")} className="ml-auto text-xs font-medium text-rose-700 hover:text-rose-900">
              View activity →
            </button>
          </div>
          <div className="divide-y divide-rose-100">
            {firingAlerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {a.name} <span className="text-slate-400 font-normal">· {a.kpi_name}</span>
                  </p>
                  <p className="text-xs text-rose-700">
                    {a.status === "no_data" ? "Returned no data" : `${conditionLabel(a)} — last value ${fmtValue(a.last_value, "number")}`}
                  </p>
                </div>
                <button onClick={() => checkAlert(a.id)} disabled={busy === a.id}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50 shrink-0">
                  Re-check
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        {([["kpis", `KPIs (${kpis.length})`], ["alerts", `Alerts (${alerts.length})`], ["activity", `Activity${unreadCount ? ` (${unreadCount})` : ""}`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}>
            {label}
            {key === "alerts" && triggeredCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white rounded-full bg-red-500">{triggeredCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── KPI cards ── */}
      {tab === "kpis" && (
        kpis.length === 0 ? (
          <EmptyState title="No KPIs yet"
            body="Define a metric — a SQL query that returns a single number — and track it against a target."
            cta="Create your first KPI" onCta={() => setKpiModal(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map((k) => {
              const st = STATUS_STYLE[k.last_status || "no_data"] || STATUS_STYLE.no_data
              const trend = k.last_value !== null && k.prev_value !== null ? k.last_value - k.prev_value : null
              const pct = k.pct_to_target
              return (
                <div key={k.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col"
                  style={{ borderTopWidth: 3, borderTopColor: st.dot }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{k.name}</h3>
                      <p className="text-xs text-slate-400 truncate">{k.source_name}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                      style={{ background: st.bg, color: st.text }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
                    </span>
                  </div>

                  <div className="flex items-end gap-2 mt-4">
                    <span className="text-3xl font-bold text-slate-900 tabular-nums">{fmtValue(k.last_value, k.unit)}</span>
                    {trend !== null && trend !== 0 && (
                      <span className={`text-xs font-semibold mb-1 ${trend > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {trend > 0 ? "▲" : "▼"} {fmtValue(Math.abs(trend), k.unit)}
                      </span>
                    )}
                  </div>
                  {k.last_error && <p className="text-xs text-rose-600 mt-1 truncate" title={k.last_error}>{k.last_error}</p>}

                  {k.target_value !== null && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>Target: {fmtValue(k.target_value, k.unit)}</span>
                        <span>{pct !== null ? `${pct.toFixed(0)}%` : "—"}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%`, background: st.dot }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400">
                      {k.alert_count > 0 ? `${k.alert_count} alert${k.alert_count > 1 ? "s" : ""} · ` : ""}
                      {timeAgo(k.last_evaluated_at)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setAlertModal({ kpi: k })} title="Add alert"
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                      </button>
                      <button onClick={() => evaluateKpi(k.id)} disabled={busy === k.id} title="Refresh now"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                        <svg className={`w-4 h-4 ${busy === k.id ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </button>
                      <button onClick={() => deleteKpi(k.id)} title="Delete"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Alerts ── */}
      {tab === "alerts" && (
        alerts.length === 0 ? (
          <EmptyState title="No alerts configured"
            body="Add an alert to a KPI — get notified when it crosses a threshold, moves by a %, or returns no data."
            cta="Add an alert"
            onCta={() => setAlertModal({ kpi: null })} />
        ) : (
          <div>
            {/* status summary + filter chips */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {([["all", `All ${alerts.length}`], ["active", `Active ${activeCount}`], ["paused", `Paused ${pausedCount}`]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setAlertFilter(key as typeof alertFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    alertFilter === key ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}>
                  {label}
                </button>
              ))}
              {triggeredCount > 0 && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{triggeredCount} firing now
                </span>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-4 py-3 font-semibold">Alert</th>
                  <th className="px-4 py-3 font-semibold">Condition</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Monitoring</th>
                  <th className="px-4 py-3 font-semibold">Last check</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts
                  .filter((a) => alertFilter === "all" || (alertFilter === "active" ? a.enabled : !a.enabled))
                  .map((a) => {
                  const ast = ALERT_STATUS[a.status] || ALERT_STATUS.ok
                  return (
                    <tr key={a.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 ${a.enabled ? "" : "opacity-55"}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{a.name}</p>
                        <p className="text-xs text-slate-400">{a.kpi_name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{conditionLabel(a)}</td>
                      <td className="px-4 py-3">
                        {a.enabled ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
                            style={{ background: ast.bg, color: ast.text }}>{a.status.replace("_", " ")}</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {a.enabled ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />Paused
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{a.enabled ? timeAgo(a.last_checked_at) : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => toggleAlert(a)} title={a.enabled ? "Pause monitoring" : "Resume monitoring"}
                            className={`relative w-8 rounded-full transition-colors ${a.enabled ? "bg-blue-500" : "bg-slate-300"}`}
                            style={{ height: 18 }}>
                            <span className="absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all"
                              style={{ left: a.enabled ? 14 : 2 }} />
                          </button>
                          <button onClick={() => checkAlert(a.id)} disabled={busy === a.id} title="Check now"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40">
                            <svg className={`w-4 h-4 ${busy === a.id ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          </button>
                          <button onClick={() => deleteAlert(a.id)} title="Delete"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )
      )}

      {/* ── Activity / notifications ── */}
      {tab === "activity" && (
        notifications.length === 0 ? (
          <EmptyState title="No alert activity yet"
            body="When an alert fires, it shows up here. Nothing has triggered so far — that's a good thing." />
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const ast = ALERT_STATUS[n.status] || ALERT_STATUS.triggered
              return (
                <div key={n.id} className={`bg-white rounded-xl border p-4 flex items-start gap-3 ${n.read ? "border-slate-200" : "border-blue-200"}`}>
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: ast.text }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800 text-sm">{n.alert_name}</span>
                      <span className="text-xs text-slate-400">· {n.kpi_name}</span>
                      {n.acknowledged && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">Acknowledged</span>}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
                    {n.acknowledged_comment && <p className="text-xs text-slate-400 mt-1 italic">“{n.acknowledged_comment}”</p>}
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.acknowledged && (
                    <button onClick={() => acknowledge(n.id)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50">
                      Acknowledge
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {kpiModal && <KpiModal sources={sources} token={token!} onClose={() => setKpiModal(false)} onSaved={() => { setKpiModal(false); load() }} />}
      {alertModal && <AlertModal kpis={kpis} initialKpi={alertModal.kpi} token={token!} onClose={() => setAlertModal(null)} onSaved={() => { setAlertModal(null); load(); setTab("alerts") }} onNeedKpi={() => { setAlertModal(null); setKpiModal(true) }} />}
    </div>
  )
}

function conditionLabel(a: Alert): string {
  if (a.alert_type === "threshold") return `value ${a.operator} ${a.threshold_value}`
  if (a.alert_type === "pct_change") return `changes by ≥ ${a.pct_change}%`
  if (a.alert_type === "no_data") return "returns no data"
  return a.alert_type
}

function EmptyState({ title, body, cta, onCta }: { title: string; body: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(37,99,235,0.07)" }}>
        <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
      </div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{body}</p>
      {cta && onCta && (
        <button onClick={onCta} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>{cta}</button>
      )}
    </div>
  )
}

// ── Create KPI modal ───────────────────────────────────────────
function KpiModal({ sources, token, onClose, onSaved }: { sources: Source[]; token: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    source_id: sources[0]?.id ?? 0, name: "", sql: "", description: "",
    target_value: "", direction: "higher", unit: "number", threshold_green: "", threshold_yellow: "",
  })
  const [preview, setPreview] = useState<{ value: number | null; note: string | null } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }))

  async function testSql() {
    setError(""); setPreview(null)
    if (!form.source_id || !form.sql.trim()) { setError("Pick a source and write a query first."); return }
    setPreviewing(true)
    try {
      const r = await apiPost<{ value: number | null; note: string | null }>("/api/kpis/preview",
        { source_id: form.source_id, sql: form.sql }, token)
      setPreview(r)
    } catch (e: any) { setError(e?.message || "Query failed") }
    finally { setPreviewing(false) }
  }

  async function save() {
    setError("")
    if (!form.source_id || !form.name.trim() || !form.sql.trim()) { setError("Source, name and query are required."); return }
    setSaving(true)
    try {
      await apiPost("/api/kpis", {
        source_id: form.source_id, name: form.name, sql: form.sql, description: form.description || null,
        target_value: form.target_value === "" ? null : Number(form.target_value),
        direction: form.direction, unit: form.unit,
        threshold_green: form.threshold_green === "" ? null : Number(form.threshold_green),
        threshold_yellow: form.threshold_yellow === "" ? null : Number(form.threshold_yellow),
      }, token)
      onSaved()
    } catch (e: any) { setError(e?.message || "Could not save KPI"); setSaving(false) }
  }

  return (
    <Modal title="New KPI" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Data source">
          <select value={form.source_id} onChange={(e) => set("source_id", Number(e.target.value))} className={inputCls}>
            {sources.length === 0 && <option value={0}>No sources — connect one first</option>}
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
          </select>
        </Field>
        <Field label="Name">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Monthly Revenue" className={inputCls} />
        </Field>
        <Field label="Metric query" hint="Must return a single number (first numeric value of the first row).">
          <textarea value={form.sql} onChange={(e) => set("sql", e.target.value)} rows={3}
            placeholder="SELECT SUM(amount) FROM orders WHERE status = 'paid'"
            className={inputCls + " font-mono text-xs"} />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={testSql} disabled={previewing}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {previewing ? "Testing…" : "Test query"}
            </button>
            {preview && (
              <span className="text-xs">
                {preview.value !== null
                  ? <span className="text-emerald-700 font-medium">= {preview.value.toLocaleString()}</span>
                  : <span className="text-amber-600">{preview.note}</span>}
              </span>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target (optional)">
            <input type="number" value={form.target_value} onChange={(e) => set("target_value", e.target.value)} placeholder="100000" className={inputCls} />
          </Field>
          <Field label="Format">
            <select value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls}>
              <option value="number">Number</option><option value="currency">Currency ($)</option><option value="percent">Percent (%)</option>
            </select>
          </Field>
        </div>
        <Field label="Direction">
          <div className="flex gap-2">
            {[["higher", "Higher is better"], ["lower", "Lower is better"]].map(([v, l]) => (
              <button key={v} onClick={() => set("direction", v)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border ${form.direction === v ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Green at/beyond" hint="Healthy band edge">
            <input type="number" value={form.threshold_green} onChange={(e) => set("threshold_green", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Yellow at/beyond" hint="Warning band edge">
            <input type="number" value={form.threshold_yellow} onChange={(e) => set("threshold_yellow", e.target.value)} className={inputCls} />
          </Field>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} saveLabel="Create KPI" />
    </Modal>
  )
}

// ── Create Alert modal ─────────────────────────────────────────
function AlertModal({ kpis, initialKpi, token, onClose, onSaved, onNeedKpi }: { kpis: KPI[]; initialKpi: KPI | null; token: string; onClose: () => void; onSaved: () => void; onNeedKpi: () => void }) {
  const startKpi = initialKpi ?? kpis[0]
  const [kpiId, setKpiId] = useState<number>(startKpi?.id ?? 0)
  const selectedKpi = kpis.find((k) => k.id === kpiId) ?? startKpi
  const [nameTouched, setNameTouched] = useState(false)
  const [form, setForm] = useState({
    name: startKpi ? `${startKpi.name} alert` : "", alert_type: "threshold", operator: ">",
    threshold_value: "", pct_change: "", check_frequency: 3600, cooldown: 3600,
    in_app: true, email: false, teams: false, webhook: false, webhook_url: "", email_to: "",
    email_subject: "", email_body: "",
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  // When the user picks a different KPI, refresh the default name (unless they edited it)
  function onPickKpi(id: number) {
    setKpiId(id)
    const k = kpis.find((x) => x.id === id)
    if (k && !nameTouched) set("name", `${k.name} alert`)
  }

  async function save() {
    setError("")
    if (!kpiId) { setError("Pick a KPI to watch."); return }
    const channels = [form.in_app && "in_app", form.email && "email", form.teams && "teams", form.webhook && "webhook"].filter(Boolean)
    if (channels.length === 0) { setError("Pick at least one notification channel."); return }
    if (form.alert_type === "threshold" && form.threshold_value === "") { setError("Enter a threshold value."); return }
    if (form.alert_type === "pct_change" && form.pct_change === "") { setError("Enter a % change."); return }
    setSaving(true)
    try {
      await apiPost("/api/alerts", {
        kpi_id: kpiId, name: form.name || `${selectedKpi?.name} alert`, alert_type: form.alert_type, operator: form.operator,
        threshold_value: form.threshold_value === "" ? null : Number(form.threshold_value),
        pct_change: form.pct_change === "" ? null : Number(form.pct_change),
        check_frequency: form.check_frequency, cooldown: form.cooldown,
        channels, webhook_url: form.webhook ? form.webhook_url : null,
        email_to: form.email ? (form.email_to || null) : null,
        email_subject: form.email ? (form.email_subject || null) : null,
        email_body: form.email ? (form.email_body || null) : null,
      }, token)
      onSaved()
    } catch (e: any) { setError(e?.message || "Could not save alert"); setSaving(false) }
  }

  // An alert watches a KPI — if there are none yet, guide the user to make one.
  if (kpis.length === 0) {
    return (
      <Modal title="New alert" onClose={onClose}>
        <div className="text-center py-4">
          <p className="text-sm text-slate-600">An alert watches a <span className="font-semibold">KPI</span>, but you don’t have any yet.</p>
          <p className="text-xs text-slate-400 mt-1">Create a KPI first, then come back to add an alert on it.</p>
          <button onClick={onNeedKpi} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            Create a KPI
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="New alert" onClose={onClose}>
      <div className="space-y-4">
        <Field label="KPI to watch" hint={selectedKpi ? `Current value: ${fmtValue(selectedKpi.last_value, selectedKpi.unit)}` : undefined}>
          <select value={kpiId} onChange={(e) => onPickKpi(Number(e.target.value))} className={inputCls} disabled={!!initialKpi}>
            {kpis.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.source_name})</option>)}
          </select>
        </Field>
        <Field label="Alert name">
          <input value={form.name} onChange={(e) => { set("name", e.target.value); setNameTouched(true) }} className={inputCls} />
        </Field>
        <Field label="Trigger when">
          <div className="grid grid-cols-3 gap-2">
            {[["threshold", "Crosses value"], ["pct_change", "Changes by %"], ["no_data", "No data"]].map(([v, l]) => (
              <button key={v} onClick={() => set("alert_type", v)}
                className={`px-2 py-2 rounded-lg text-xs border ${form.alert_type === v ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </Field>
        {form.alert_type === "threshold" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Operator">
              <select value={form.operator} onChange={(e) => set("operator", e.target.value)} className={inputCls}>
                {[">", ">=", "<", "<=", "==", "!="].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Value">
              <input type="number" value={form.threshold_value} onChange={(e) => set("threshold_value", e.target.value)} placeholder="1000" className={inputCls} />
            </Field>
          </div>
        )}
        {form.alert_type === "pct_change" && (
          <Field label="% change vs previous check" hint="Fires when the metric moves by at least this %.">
            <input type="number" value={form.pct_change} onChange={(e) => set("pct_change", e.target.value)} placeholder="10" className={inputCls} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check frequency">
            <select value={form.check_frequency} onChange={(e) => set("check_frequency", Number(e.target.value))} className={inputCls}>
              {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Cooldown">
            <select value={form.cooldown} onChange={(e) => set("cooldown", Number(e.target.value))} className={inputCls}>
              {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notify via" hint="Email & Teams use the credentials from Settings → Alert Notifications.">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.in_app} onChange={(e) => set("in_app", e.target.checked)} className="rounded" />
              In-app notification
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.email} onChange={(e) => set("email", e.target.checked)} className="rounded" />
              Email
            </label>
            {form.email && (
              <div className="space-y-2 pl-6 pt-1">
                <input value={form.email_to} onChange={(e) => set("email_to", e.target.value)}
                  placeholder="recipient@company.com (blank = default from Settings)" className={inputCls + " text-xs"} />
                <input value={form.email_subject} onChange={(e) => set("email_subject", e.target.value)}
                  placeholder="Subject (blank = [DataMind Alert] {alert})" className={inputCls + " text-xs"} />
                <textarea value={form.email_body} onChange={(e) => set("email_body", e.target.value)} rows={3}
                  placeholder={"Body (blank = default summary)"} className={inputCls + " text-xs font-mono"} />
                <p className="text-[11px] text-slate-400">
                  Variables: <code>{"{alert}"}</code> <code>{"{kpi}"}</code> <code>{"{value}"}</code> <code>{"{status}"}</code> <code>{"{message}"}</code> <code>{"{source}"}</code> <code>{"{time}"}</code>
                </p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.teams} onChange={(e) => set("teams", e.target.checked)} className="rounded" />
              Microsoft Teams
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.webhook} onChange={(e) => set("webhook", e.target.checked)} className="rounded" />
              Webhook (HTTP POST)
            </label>
            {form.webhook && (
              <input value={form.webhook_url} onChange={(e) => set("webhook_url", e.target.value)}
                placeholder="https://hooks.example.com/…" className={inputCls + " text-xs"} />
            )}
          </div>
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} saveLabel="Create alert" />
    </Modal>
  )
}

// ── shared UI bits ─────────────────────────────────────────────
const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSave, saving, saveLabel }: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div className="flex justify-end gap-2 mt-6">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
      <button onClick={onSave} disabled={saving}
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  )
}
