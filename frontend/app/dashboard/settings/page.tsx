"use client"

import { useEffect, useState } from "react"
import { useAuthStore, apiGet, apiPut, apiPost, hasCapability } from "@/lib/auth-store"

interface AIUsageMember {
  user_id: number; full_name: string; email: string; role: string
  on_own_key: boolean; today_count: number; effective_limit: number
  override: number | null; month_questions: number; month_tokens: number; month_cost: number
  month_cached_tokens: number; cache_hit_pct: number
}
interface AIUsageOverview {
  members: AIUsageMember[]; workspace_daily_limit: number | null; platform_default: number; model: string
}

interface AISettings {
  configured: boolean
  use_own: boolean
  provider: string | null
  model: string | null
  base_url: string | null
  has_own_key: boolean
  platform_available: boolean
  daily_limit: number
}

interface NotifSettings {
  smtp_host: string | null
  smtp_port: number | null
  smtp_username: string | null
  smtp_from: string | null
  smtp_use_tls: boolean
  default_email_to: string | null
  has_smtp_password: boolean
  smtp_configured: boolean
  teams_webhook_url: string | null
  teams_configured: boolean
}

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-sonnet-4-6", keyHint: "sk-ant-…", needsUrl: false },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o", keyHint: "sk-…", needsUrl: false },
  { id: "ollama", label: "Ollama (local, free)", defaultModel: "llama3.1", keyHint: "(no key needed)", needsUrl: true },
]

export default function SettingsPage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  const [ai, setAi] = useState<AISettings | null>(null)
  const [useOwn, setUseOwn] = useState(false)
  const [provider, setProvider] = useState("anthropic")
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  // ── Notifications (SMTP + Teams) ──
  const [notif, setNotif] = useState<NotifSettings | null>(null)
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")
  const [smtpFrom, setSmtpFrom] = useState("")
  const [smtpTls, setSmtpTls] = useState(true)
  const [defaultTo, setDefaultTo] = useState("")
  const [teamsUrl, setTeamsUrl] = useState("")
  const [savingNotif, setSavingNotif] = useState(false)
  const [savedNotif, setSavedNotif] = useState(false)
  const [notifError, setNotifError] = useState("")
  const [testMsg, setTestMsg] = useState("")
  const [testing, setTesting] = useState(false)

  // ── AI Usage & Limits (admin) ──
  const isAdmin = hasCapability(user, "manage_users")
  const [usage, setUsage] = useState<AIUsageOverview | null>(null)
  const [wsLimit, setWsLimit] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)
  const [savedLimit, setSavedLimit] = useState(false)
  const [overrideEdits, setOverrideEdits] = useState<Record<number, string>>({})

  function loadUsage() {
    if (!token || !isAdmin) return
    apiGet<{ workspace_daily_limit: number | null; platform_default: number }>("/api/ai/limits", token)
      .then((l) => setWsLimit(l.workspace_daily_limit != null ? String(l.workspace_daily_limit) : "")).catch(() => {})
    apiGet<AIUsageOverview>("/api/ai/usage", token).then(setUsage).catch(() => {})
  }

  useEffect(() => { loadUsage() }, [token, isAdmin])  // eslint-disable-line react-hooks/exhaustive-deps

  async function saveLimit() {
    setSavingLimit(true); setSavedLimit(false)
    try {
      await apiPut("/api/ai/limits", { workspace_daily_limit: wsLimit.trim() === "" ? null : Number(wsLimit) }, token!)
      setSavedLimit(true); setTimeout(() => setSavedLimit(false), 2500); loadUsage()
    } finally { setSavingLimit(false) }
  }

  async function saveOverride(userId: number) {
    const v = overrideEdits[userId]
    const body = v === "" ? { clear_ai_limit: true } : { ai_daily_limit: Number(v) }
    await apiPut(`/api/users/${userId}`, body, token!)
    setOverrideEdits((e) => { const n = { ...e }; delete n[userId]; return n }); loadUsage()
  }

  useEffect(() => {
    if (!token) return
    apiGet<AISettings>("/api/ai/settings", token).then((s) => {
      setAi(s)
      setUseOwn(s.use_own)
      setProvider(s.provider || "anthropic")
      setModel(s.model || "")
      setBaseUrl(s.base_url || "")
    }).catch(() => {})
    apiGet<NotifSettings>("/api/notification-settings", token).then((s) => {
      setNotif(s)
      setSmtpHost(s.smtp_host || "")
      setSmtpPort(String(s.smtp_port || 587))
      setSmtpUser(s.smtp_username || "")
      setSmtpFrom(s.smtp_from || "")
      setSmtpTls(s.smtp_use_tls)
      setDefaultTo(s.default_email_to || "")
      setTeamsUrl(s.teams_webhook_url || "")
    }).catch(() => {})
  }, [token])

  async function saveNotif() {
    setSavingNotif(true); setNotifError(""); setSavedNotif(false); setTestMsg("")
    try {
      const body: Record<string, unknown> = {
        smtp_host: smtpHost || null,
        smtp_port: smtpPort ? Number(smtpPort) : null,
        smtp_username: smtpUser || null,
        smtp_from: smtpFrom || null,
        smtp_use_tls: smtpTls,
        default_email_to: defaultTo || null,
        teams_webhook_url: teamsUrl || null,
      }
      if (smtpPass) body.smtp_password = smtpPass  // only send when changed
      const s = await apiPut<NotifSettings>("/api/notification-settings", body, token!)
      setNotif(s); setSmtpPass(""); setSavedNotif(true)
      setTimeout(() => setSavedNotif(false), 2500)
    } catch (e) {
      setNotifError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingNotif(false)
    }
  }

  async function sendTest() {
    setTesting(true); setTestMsg(""); setNotifError("")
    try {
      const r = await apiPost<{ status: string; to: string[] }>("/api/notification-settings/test-email", {}, token!)
      setTestMsg(`✓ Test email sent to ${r.to.join(", ")}`)
    } catch (e) {
      setNotifError(e instanceof Error ? e.message : "Test failed")
    } finally {
      setTesting(false)
    }
  }

  const providerMeta = PROVIDERS.find((p) => p.id === provider)!

  async function save() {
    setSaving(true); setError(""); setSaved(false)
    try {
      const body: Record<string, unknown> = {
        use_own: useOwn,
        provider,
        model: model || null,
        base_url: baseUrl || null,
      }
      if (apiKey) body.api_key = apiKey  // only send when changed
      const s = await apiPut<AISettings>("/api/ai/settings", body, token!)
      setAi(s)
      setApiKey("")
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your account and AI preferences</p>
      </div>

      {/* Account */}
      <section className="bg-white rounded-2xl border border-slate-100 p-6 mb-5">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Account</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Name</p>
            <p className="text-slate-800">{user?.full_name}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Email</p>
            <p className="text-slate-800">{user?.email}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Role</p>
            <p className="text-slate-800 capitalize">{user?.role}</p>
          </div>
        </div>
      </section>

      {/* AI */}
      <section className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-slate-900">AI Provider</h2>
          {ai && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              ai.configured ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            }`}>
              {ai.configured ? "● Configured" : "○ Not configured"}
            </span>
          )}
        </div>
        <p className="text-slate-400 text-xs mb-5">Choose how AI questions are powered.</p>

        {/* Default vs own toggle */}
        <div className="space-y-2 mb-5">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            !useOwn ? "border-blue-300 bg-blue-50/40" : "border-slate-200 hover:border-slate-300"
          }`}>
            <input type="radio" checked={!useOwn} onChange={() => setUseOwn(false)} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-800">Use DataMind AI {ai?.platform_available ? "" : "(not available yet)"}</p>
              <p className="text-xs text-slate-400">Powered by our shared key. {ai ? `${ai.daily_limit} questions/day.` : ""} Nothing to set up.</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            useOwn ? "border-blue-300 bg-blue-50/40" : "border-slate-200 hover:border-slate-300"
          }`}>
            <input type="radio" checked={useOwn} onChange={() => setUseOwn(true)} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-800">Use my own API key</p>
              <p className="text-xs text-slate-400">Unlimited usage on your own provider account. Your key is encrypted and never shown again.</p>
            </div>
          </label>
        </div>

        {/* Own-key config */}
        {useOwn && (
          <div className="space-y-4 pl-1 border-l-2 border-blue-100 pl-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Provider</label>
              <select value={provider} onChange={(e) => { setProvider(e.target.value); setModel("") }} className={inputCls}>
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Model <span className="text-slate-400 font-normal">(blank = {providerMeta.defaultModel})</span>
              </label>
              <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}
                placeholder={providerMeta.defaultModel} />
            </div>

            {providerMeta.needsUrl && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Endpoint URL</label>
                <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://host.docker.internal:11434/v1" />
              </div>
            )}

            {provider !== "ollama" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  API Key {ai?.has_own_key && <span className="text-emerald-600 font-normal">· key saved</span>}
                </label>
                <input type="password" className={inputCls} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={ai?.has_own_key ? "••••••••  (leave blank to keep current)" : providerMeta.keyHint} />
                <p className="text-[11px] text-slate-400 mt-1">Stored encrypted. We never display it back.</p>
              </div>
            )}
          </div>
        )}

        {error && <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        <div className="flex items-center gap-3 mt-5">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            {saving ? "Saving…" : "Save AI settings"}
          </button>
          {saved && <span className="text-emerald-600 text-sm">✓ Saved</span>}
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-white rounded-2xl border border-slate-100 p-6 mt-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-slate-900">Alert Notifications</h2>
          {notif && (
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${notif.smtp_configured ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {notif.smtp_configured ? "● Email" : "○ Email"}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${notif.teams_configured ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {notif.teams_configured ? "● Teams" : "○ Teams"}
              </span>
            </div>
          )}
        </div>
        <p className="text-slate-400 text-xs mb-5">Where KPI alerts get delivered. Used when an alert has the Email or Teams channel enabled.</p>

        {/* Email / SMTP */}
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Email (SMTP)</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">SMTP host</label>
            <input className={inputCls} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Port</label>
            <input className={inputCls} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Username</label>
            <input className={inputCls} value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Password {notif?.has_smtp_password && <span className="text-emerald-600 font-normal">· saved</span>}
            </label>
            <input type="password" className={inputCls} value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={notif?.has_smtp_password ? "••••••••  (blank = keep)" : "app password"} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">From address</label>
            <input className={inputCls} value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="alerts@company.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Default recipient(s)</label>
            <input className={inputCls} value={defaultTo} onChange={(e) => setDefaultTo(e.target.value)} placeholder="team@company.com, me@company.com" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 mt-3">
          <input type="checkbox" checked={smtpTls} onChange={(e) => setSmtpTls(e.target.checked)} className="rounded" />
          Use STARTTLS (recommended; port 465 uses implicit SSL automatically)
        </label>
        <p className="text-[11px] text-slate-400 mt-1">Password is stored encrypted and never shown again. For Gmail/Outlook use an app password.</p>

        {/* Teams */}
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 mt-6">Microsoft Teams</h3>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Incoming webhook URL</label>
          <input className={inputCls} value={teamsUrl} onChange={(e) => setTeamsUrl(e.target.value)}
            placeholder="https://outlook.office.com/webhook/…" />
          <p className="text-[11px] text-slate-400 mt-1">Teams channel → Connectors → Incoming Webhook → copy the URL here.</p>
        </div>

        {notifError && <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{notifError}</div>}
        {testMsg && <div className="mt-4 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{testMsg}</div>}

        <div className="flex items-center gap-3 mt-5">
          <button onClick={saveNotif} disabled={savingNotif}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            {savingNotif ? "Saving…" : "Save notification settings"}
          </button>
          <button onClick={sendTest} disabled={testing || !notif?.smtp_configured}
            title={notif?.smtp_configured ? "Send a test email" : "Configure & save SMTP first"}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
            {testing ? "Sending…" : "Send test email"}
          </button>
          {savedNotif && <span className="text-emerald-600 text-sm">✓ Saved</span>}
        </div>
      </section>

      {/* AI Usage & Limits (admin only) */}
      {isAdmin && (
        <section className="bg-white rounded-2xl border border-slate-100 p-6 mt-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-slate-900">AI Usage &amp; Limits</h2>
            {usage && <span className="text-[11px] text-slate-400">model: {usage.model || "—"}</span>}
          </div>
          <p className="text-slate-400 text-xs mb-5">Cap AI questions per user/day on the shared key, and watch each member&apos;s monthly usage &amp; cost. (Members on their own API key are unlimited.)</p>

          {/* workspace default limit */}
          <div className="flex items-end gap-3 mb-5">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Workspace daily limit <span className="text-slate-400 font-normal">(per user)</span></label>
              <input className={inputCls} value={wsLimit} onChange={(e) => setWsLimit(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={usage ? `${usage.platform_default} (platform default)` : "platform default"} />
              <p className="text-[11px] text-slate-400 mt-1">Blank = platform default ({usage?.platform_default ?? "—"}/day).</p>
            </div>
            <button onClick={saveLimit} disabled={savingLimit}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
              {savingLimit ? "Saving…" : "Save limit"}
            </button>
            {savedLimit && <span className="text-emerald-600 text-sm pb-2.5">✓ Saved</span>}
          </div>

          {/* per-member usage table */}
          <div className="border border-slate-100 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-3 py-2.5 font-semibold">Member</th>
                  <th className="px-3 py-2.5 font-semibold">Today</th>
                  <th className="px-3 py-2.5 font-semibold">This month</th>
                  <th className="px-3 py-2.5 font-semibold">Cache hit</th>
                  <th className="px-3 py-2.5 font-semibold">Est. cost</th>
                  <th className="px-3 py-2.5 font-semibold">Daily limit override</th>
                </tr>
              </thead>
              <tbody>
                {usage?.members.map((m) => {
                  const editing = m.user_id in overrideEdits
                  return (
                    <tr key={m.user_id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800">{m.full_name}</p>
                        <p className="text-[11px] text-slate-400">{m.email} · {m.role}{m.on_own_key ? " · own key" : ""}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {m.on_own_key ? <span className="text-slate-300">—</span> : <span><b>{m.today_count}</b> / {m.effective_limit}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{m.month_questions} q · {m.month_tokens.toLocaleString()} tok</td>
                      <td className="px-3 py-2.5">
                        {m.on_own_key || m.month_tokens === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={`text-xs font-semibold ${m.cache_hit_pct >= 30 ? "text-emerald-600" : "text-slate-400"}`}
                            title={`${m.month_cached_tokens.toLocaleString()} input tokens served from cache`}>
                            {m.cache_hit_pct}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{m.on_own_key ? <span className="text-slate-300">—</span> : `$${m.month_cost.toFixed(2)}`}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            value={editing ? overrideEdits[m.user_id] : (m.override != null ? String(m.override) : "")}
                            onChange={(e) => setOverrideEdits((o) => ({ ...o, [m.user_id]: e.target.value.replace(/[^0-9]/g, "") }))}
                            placeholder="default"
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-blue-400 focus:outline-none" />
                          {editing && (
                            <button onClick={() => saveOverride(m.user_id)}
                              className="text-xs font-medium px-2 py-1.5 rounded-lg text-white" style={{ background: "#2563eb" }}>Set</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {usage && usage.members.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400 text-sm">No members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Override blank = use the workspace limit. Cost is an estimate from token usage, not a bill.</p>
        </section>
      )}
    </div>
  )
}
