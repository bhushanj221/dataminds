"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete, hasCapability } from "@/lib/auth-store"

interface ManagedUser {
  id: number; email: string; full_name: string; role: string; is_active: boolean; created_at: string
}

const ROLE_INFO: Record<string, { label: string; desc: string; color: string; bg: string }> = {
  admin:         { label: "Admin", desc: "Full control + user management", color: "#b91c1c", bg: "#fef2f2" },
  data_engineer: { label: "Data Engineer", desc: "Sources, semantic layer, query, build", color: "#7c3aed", bg: "#f5f3ff" },
  analyst:       { label: "Analyst", desc: "Query + build dashboards/charts/KPIs", color: "#2563eb", bg: "#eff6ff" },
  viewer:        { label: "Viewer", desc: "Read-only", color: "#475569", bg: "#f1f5f9" },
}
const ROLES = ["admin", "data_engineer", "analyst", "viewer"]

export default function UsersPage() {
  const token = useAuthStore((s) => s.token)
  const me = useAuthStore((s) => s.user)
  const isAdmin = hasCapability(me, "manage_users")

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [modal, setModal] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!token || !isAdmin) return
    apiGet<ManagedUser[]>("/api/users", token).then(setUsers).catch(() => {})
  }, [token, isAdmin])
  useEffect(() => { load() }, [load])

  async function changeRole(u: ManagedUser, role: string) {
    if (!token) return
    setBusy(u.id); setError("")
    try { await apiPut(`/api/users/${u.id}`, { role }, token); load() }
    catch (e: any) { setError(e?.message || "Update failed") }
    finally { setBusy(null) }
  }
  async function toggleActive(u: ManagedUser) {
    if (!token) return
    setBusy(u.id); setError("")
    try { await apiPut(`/api/users/${u.id}`, { is_active: !u.is_active }, token); load() }
    catch (e: any) { setError(e?.message || "Update failed") }
    finally { setBusy(null) }
  }
  async function remove(u: ManagedUser) {
    if (!token || !confirm(`Delete ${u.full_name} (${u.email})? This cannot be undone.`)) return
    setBusy(u.id); setError("")
    try { await apiDelete(`/api/users/${u.id}`, token); load() }
    catch (e: any) { setError(e?.message || "Delete failed") }
    finally { setBusy(null) }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 bg-rose-50">
            <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h3 className="font-semibold text-slate-800">Admins only</h3>
          <p className="text-sm text-slate-500 mt-1">You need the Admin role to manage users. Ask a workspace admin for access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users &amp; Roles</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage who can access {me?.workspace_name ? <span className="font-semibold text-slate-700">{me.workspace_name}</span> : "this workspace"} and what they can do.
          </p>
        </div>
        <button onClick={() => setModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add user
        </button>
      </div>

      {/* role legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-slate-200 p-3">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: ROLE_INFO[r].bg, color: ROLE_INFO[r].color }}>{ROLE_INFO[r].label}</span>
            <p className="text-[11px] text-slate-500 mt-1.5">{ROLE_INFO[r].desc}</p>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id
              return (
                <tr key={u.id} className={`border-b border-slate-50 last:border-0 ${u.is_active ? "" : "opacity-55"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                        {u.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{u.full_name} {isMe && <span className="text-[10px] text-slate-400">(you)</span>}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select value={u.role} disabled={busy === u.id} onChange={(e) => changeRole(u, e.target.value)}
                      className="text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:outline-none"
                      style={{ color: ROLE_INFO[u.role]?.color }}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u)} disabled={busy === u.id || isMe} title={isMe ? "You can't change your own status" : ""}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${isMe ? "cursor-not-allowed" : ""}`}
                      style={{ color: u.is_active ? "#15803d" : "#94a3b8" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.is_active ? "#22c55e" : "#cbd5e1" }} />
                      {u.is_active ? "Active" : "Deactivated"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(u)} disabled={busy === u.id || isMe} title={isMe ? "You can't delete yourself" : "Delete user"}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && <AddUserModal token={token!} onClose={() => setModal(false)} onSaved={() => { setModal(false); load() }} />}
    </div>
  )
}

function AddUserModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "analyst" })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"

  async function save() {
    setError("")
    if (!form.email.trim() || !form.full_name.trim() || form.password.length < 8) {
      setError("Email, name, and a password of 8+ characters are required."); return
    }
    setSaving(true)
    try { await apiPost("/api/users", form, token); onSaved() }
    catch (e: any) { setError(e?.message || "Could not create user"); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Add user</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full name</label>
            <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={inputCls} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} placeholder="jane@company.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Temporary password</label>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className={inputCls} placeholder="At least 8 characters" />
            <p className="text-[11px] text-slate-400 mt-1">Share this with the user; they sign in with it.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
            <select value={form.role} onChange={(e) => set("role", e.target.value)} className={inputCls}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].label} — {ROLE_INFO[r].desc}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            {saving ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </div>
  )
}
