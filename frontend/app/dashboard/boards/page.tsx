"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete } from "@/lib/auth-store"
import type { BoardWidget, BoardFilter } from "@/components/board-grid"

// Palette swatches (mirror backend app/services/charting.py PALETTES)
const PALETTES: Record<string, string[]> = {
  default: ["#2563eb", "#06b6d4", "#7c3aed", "#059669", "#f59e0b"],
  ocean:   ["#0ea5e9", "#0891b2", "#2563eb", "#06b6d4", "#3b82f6"],
  sunset:  ["#f97316", "#ef4444", "#f59e0b", "#ec4899", "#e11d48"],
  forest:  ["#059669", "#65a30d", "#16a34a", "#0d9488", "#84cc16"],
  berry:   ["#7c3aed", "#db2777", "#8b5cf6", "#ec4899", "#a855f7"],
  slate:   ["#475569", "#0ea5e9", "#64748b", "#38bdf8", "#94a3b8"],
  vibrant: ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981"],
}

interface VarDef { name: string; type: string; default: string; options?: string[] }
interface BoardConfig { theme: string; palette: string; filters: BoardFilter[]; refresh?: number; variables?: VarDef[] }
const REFRESH_OPTIONS: { label: string; secs: number }[] = [
  { label: "Off", secs: 0 }, { label: "10s", secs: 10 }, { label: "30s", secs: 30 },
  { label: "1m", secs: 60 }, { label: "5m", secs: 300 },
]
interface FilterFieldOption { column: string; values: string[]; kind?: string; charts: number }

const BoardGrid = dynamic(() => import("@/components/board-grid"), {
  ssr: false,
  loading: () => <div className="h-72 bg-slate-50 animate-pulse rounded-2xl" />,
})

interface DashboardItem {
  id: number
  name: string
  layout: BoardWidget[]
  config?: BoardConfig
  folder_id?: number | null
  updated_at: string
  access: string        // owner | admin | edit | view
  can_edit: boolean
  is_owner: boolean
  owner_name: string | null
  share_count: number
}
interface Folder { id: number; name: string; parent_id: number | null; dashboard_count: number }
interface SavedChart { id: number; name: string; chart_type: string }
interface Member { id: number; full_name: string; email: string; role: string }
interface Share { user_id: number; full_name: string; email: string; permission: string }

export default function BoardsPage() {
  const token = useAuthStore((s) => s.token)
  const [boards, setBoards] = useState<DashboardItem[]>([])
  const [charts, setCharts] = useState<SavedChart[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolder, setActiveFolder] = useState<number | "all" | "none">("all")
  const [open, setOpen] = useState<DashboardItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [sharing, setSharing] = useState<DashboardItem | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [newFolderUnder, setNewFolderUnder] = useState<number | "root" | null>(null)
  const [folderName, setFolderName] = useState("")
  const [moveFor, setMoveFor] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!token) return
    apiGet<DashboardItem[]>("/api/dashboards", token).then(setBoards).catch(() => {})
    apiGet<SavedChart[]>("/api/charts", token).then(setCharts).catch(() => {})
    apiGet<Folder[]>("/api/dashboard-folders", token).then(setFolders).catch(() => {})
  }, [token])

  function startNewFolder(under: number | "root") {
    if (typeof under === "number") setExpanded((s) => new Set(s).add(under))
    setFolderName(""); setNewFolderUnder(under)
  }
  async function createFolder() {
    if (!folderName.trim() || !token) return
    const parent_id = newFolderUnder === "root" || newFolderUnder === null ? null : newFolderUnder
    await apiPost("/api/dashboard-folders", { name: folderName.trim(), parent_id }, token)
    setNewFolderUnder(null); setFolderName(""); load()
  }
  async function deleteFolder(id: number) {
    if (!confirm("Delete this folder? Its dashboards and subfolders move up one level — nothing is lost.")) return
    await apiDelete(`/api/dashboard-folders/${id}`, token!)
    if (activeFolder === id) setActiveFolder("all")
    load()
  }
  async function renameFolder(id: number, current: string) {
    const name = prompt("Rename folder", current)
    if (!name || !name.trim()) return
    await apiPut(`/api/dashboard-folders/${id}`, { name: name.trim() }, token!)
    load()
  }
  async function moveBoard(boardId: number, folderId: number | null) {
    setMoveFor(null)
    await apiPut(`/api/dashboards/${boardId}`, { folder_id: folderId }, token!)
    load()
  }
  function toggleExpand(id: number) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  useEffect(() => { load() }, [load])

  // Auto-open a board after the AI dashboard builder redirects here.
  useEffect(() => {
    const id = sessionStorage.getItem("dm_open_board")
    if (id && boards.length) {
      const b = boards.find((x) => x.id === Number(id))
      if (b) { setOpen(b); sessionStorage.removeItem("dm_open_board") }
    }
  }, [boards])

  async function createBoard() {
    if (!newName.trim() || !token) return
    const d = await apiPost<DashboardItem>("/api/dashboards", { name: newName.trim(), layout: [] }, token)
    setCreating(false); setNewName("")
    load()
    setOpen(d)
  }

  if (open) {
    return (
      <BoardView
        board={open}
        charts={charts}
        token={token!}
        onBack={() => { setOpen(null); load() }}
      />
    )
  }

  const shown = boards.filter((b) =>
    activeFolder === "all" ? true : activeFolder === "none" ? !b.folder_id : b.folder_id === activeFolder)

  // tree helpers
  const childrenOf = (pid: number | null) =>
    folders.filter((f) => (f.parent_id ?? null) === pid).sort((a, b) => a.name.localeCompare(b.name))
  const flat: { f: Folder; depth: number }[] = []        // full tree (for move menu)
  const walk = (pid: number | null, depth: number) => {
    for (const f of childrenOf(pid)) { flat.push({ f, depth }); walk(f.id, depth + 1) }
  }
  walk(null, 0)
  const visibleRows: { f: Folder; depth: number; hasKids: boolean }[] = []  // tree honoring expand
  const walkVis = (pid: number | null, depth: number) => {
    for (const f of childrenOf(pid)) {
      const kids = childrenOf(f.id)
      visibleRows.push({ f, depth, hasKids: kids.length > 0 })
      if (expanded.has(f.id)) walkVis(f.id, depth + 1)
    }
  }
  walkVis(null, 0)
  const uncatCount = boards.filter((b) => !b.folder_id).length

  return (
    <div className="max-w-7xl mx-auto" onClick={() => moveFor !== null && setMoveFor(null)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboards</h1>
          <p className="text-slate-400 text-sm mt-0.5">Arrange your saved charts on drag-and-drop boards</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          New dashboard
        </button>
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setCreating(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">New dashboard</h2>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBoard()}
              placeholder="Sales Overview"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={createBoard} disabled={!newName.trim()}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {sharing && <ShareModal board={sharing} token={token!} onClose={() => { setSharing(null); load() }} />}

      <div className="flex gap-6 items-start">
        {/* ── Folder tree sidebar ── */}
        <aside className="w-60 shrink-0 hidden md:block">
          <div className="bg-white rounded-2xl border border-slate-100 p-2 space-y-0.5">
            <FolderNav label="All dashboards" count={boards.length} active={activeFolder === "all"}
              onClick={() => setActiveFolder("all")} leaf />
            {visibleRows.map(({ f, depth, hasKids }) => {
              const active = activeFolder === f.id
              return (
                <div key={f.id}>
                  <div onClick={() => setActiveFolder(f.id)}
                    style={{ paddingLeft: 8 + depth * 16 }}
                    className={`group flex items-center gap-1.5 pr-1.5 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                      active ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                    }`}>
                    {hasKids ? (
                      <button onClick={(e) => { e.stopPropagation(); toggleExpand(f.id) }} className="p-0.5 -ml-0.5 shrink-0">
                        <svg className={`w-3.5 h-3.5 transition-transform ${expanded.has(f.id) ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                      </button>
                    ) : <span className="w-3.5 shrink-0" />}
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-[10px] text-slate-400 group-hover:hidden">{f.dashboard_count || ""}</span>
                    <span className="hidden group-hover:flex items-center">
                      <button onClick={(e) => { e.stopPropagation(); startNewFolder(f.id) }} title="Add subfolder" className="text-slate-300 hover:text-blue-500 p-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); renameFolder(f.id, f.name) }} title="Rename" className="text-slate-300 hover:text-blue-500 p-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteFolder(f.id) }} title="Delete" className="text-slate-300 hover:text-red-500 p-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </span>
                  </div>
                  {newFolderUnder === f.id && (
                    <FolderInput depth={depth + 1} value={folderName} onChange={setFolderName}
                      onSubmit={createFolder} onCancel={() => setNewFolderUnder(null)} />
                  )}
                </div>
              )
            })}
            {newFolderUnder === "root" && (
              <FolderInput depth={0} value={folderName} onChange={setFolderName}
                onSubmit={createFolder} onCancel={() => setNewFolderUnder(null)} />
            )}
            <FolderNav label="Uncategorized" count={uncatCount} active={activeFolder === "none"}
              onClick={() => setActiveFolder("none")} leaf muted />
          </div>
          <button onClick={() => startNewFolder("root")}
            className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            New folder
          </button>
        </aside>

        {/* ── Dashboards grid ── */}
        <div className="flex-1 min-w-0">
      {boards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(37,99,235,0.07)" }}>
            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/>
            </svg>
          </div>
          <p className="text-slate-700 font-semibold mb-1">No dashboards yet</p>
          <p className="text-slate-400 text-sm mb-5 max-w-sm">
            {charts.length === 0
              ? "Save some charts first, then arrange them here."
              : `You have ${charts.length} saved chart(s) ready to pin to a board.`}
          </p>
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            Create a dashboard
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400 text-sm">
          No dashboards in this folder yet. Hover a dashboard and use the folder icon to move it here.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((b) => {
            const canManage = b.access === "owner" || b.access === "admin"
            return (
            <div key={b.id} onClick={() => setOpen(b)} role="button" tabIndex={0}
              className="relative bg-white rounded-2xl border border-slate-100 p-5 text-left hover:shadow-md hover:border-blue-100 transition-all group cursor-pointer">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "rgba(37,99,235,0.07)" }}>
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/>
                  </svg>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canManage && (
                    <span onClick={(e) => { e.stopPropagation(); setMoveFor(moveFor === b.id ? null : b.id) }} title="Move to folder"
                      className="text-slate-300 hover:text-blue-500 p-1 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
                    </span>
                  )}
                  {canManage && (
                    <span onClick={(e) => { e.stopPropagation(); setSharing(b) }} title="Share"
                      className="text-slate-300 hover:text-blue-500 p-1 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                    </span>
                  )}
                  {canManage && (
                    <span onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm(`Delete dashboard "${b.name}"?`)) return
                        await apiDelete(`/api/dashboards/${b.id}`, token!)
                        load()
                      }}
                      className="text-slate-300 hover:text-red-500 p-1 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </span>
                  )}
                </div>
              </div>

              {moveFor === b.id && (
                <div onClick={(e) => e.stopPropagation()}
                  className="absolute right-4 top-12 z-20 w-52 max-h-72 overflow-auto bg-white rounded-xl border border-slate-200 shadow-lg py-1">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Move to</p>
                  <button onClick={() => moveBoard(b.id, null)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${!b.folder_id ? "text-blue-600 font-semibold" : "text-slate-600"}`}>
                    Uncategorized
                  </button>
                  {flat.map(({ f, depth }) => (
                    <button key={f.id} onClick={() => moveBoard(b.id, f.id)}
                      style={{ paddingLeft: 12 + depth * 14 }}
                      className={`w-full flex items-center gap-1.5 text-left pr-3 py-1.5 text-sm truncate hover:bg-slate-50 ${b.folder_id === f.id ? "text-blue-600 font-semibold" : "text-slate-600"}`}>
                      <svg className="w-3.5 h-3.5 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                  {folders.length === 0 && <p className="px-3 py-1.5 text-xs text-slate-400">No folders — create one first</p>}
                </div>
              )}

              <p className="text-slate-900 font-semibold text-sm">{b.name}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <p className="text-slate-400 text-xs">{b.layout.length} widget(s)</p>
                {!b.is_owner && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    {b.access === "admin" ? "admin" : b.can_edit ? "shared · can edit" : "shared · view"}
                    {b.owner_name ? ` · by ${b.owner_name}` : ""}
                  </span>
                )}
                {b.is_owner && b.share_count > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                    shared with {b.share_count}
                  </span>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

// ── Folder tree helpers ────────────────────────────────────────
function FolderNav({ label, count, active, onClick, leaf, muted }: {
  label: string; count: number; active: boolean; onClick: () => void; leaf?: boolean; muted?: boolean
}) {
  return (
    <div onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
        active ? "bg-blue-50 text-blue-700 font-semibold" : `${muted ? "text-slate-400" : "text-slate-600"} hover:bg-slate-50`
      }`}>
      <span className="w-3.5 shrink-0" />
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        {leaf
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/>
          : <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>}
      </svg>
      <span className="truncate flex-1">{label}</span>
      <span className="text-[10px] text-slate-400">{count || ""}</span>
    </div>
  )
}

function FolderInput({ depth, value, onChange, onSubmit, onCancel }: {
  depth: number; value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-1 py-1" style={{ paddingLeft: 8 + depth * 16 }}>
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel() }}
        onBlur={() => value.trim() ? onSubmit() : onCancel()}
        placeholder="Folder name"
        className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-blue-300 text-xs outline-none focus:ring-2 focus:ring-blue-100" />
    </div>
  )
}

// ── Share modal (selective per-user sharing, §14.1) ────────────
function ShareModal({ board, token, onClose }: { board: DashboardItem; token: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  const reload = useCallback(() => {
    apiGet<Member[]>("/api/dashboards/shareable-users", token).then(setMembers).catch(() => {})
    apiGet<Share[]>(`/api/dashboards/${board.id}/shares`, token).then(setShares).catch(() => {})
  }, [board.id, token])
  useEffect(() => { reload() }, [reload])

  const permFor = (uid: number) => shares.find((s) => s.user_id === uid)?.permission ?? "none"

  async function setPerm(uid: number, permission: string) {
    setBusy(uid)
    try {
      if (permission === "none") await apiDelete(`/api/dashboards/${board.id}/shares/${uid}`, token)
      else await apiPut(`/api/dashboards/${board.id}/shares`, { user_id: uid, permission }, token)
      reload()
    } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-bold text-slate-900">Share “{board.name}”</h2>
            <p className="text-xs text-slate-400">Pick who in your workspace can see or edit this dashboard.</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5">
          {members.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No other members in your workspace yet. Onboard people from Users &amp; Roles first.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const perm = permFor(m.id)
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                      {m.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{m.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">{m.email}</p>
                    </div>
                    <select value={perm} disabled={busy === m.id} onChange={(e) => setPerm(m.id, e.target.value)}
                      className="text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:border-blue-400 focus:outline-none">
                      <option value="none">No access</option>
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                  </div>
                )
              })}
            </div>
          )}
          {shares.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-4">Shared with {shares.length} {shares.length === 1 ? "person" : "people"}. They’ll see it under Dashboards.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Board view (grid + filters + theming) ──────────────────────
function BoardView({ board, charts, token, onBack }: {
  board: DashboardItem
  charts: SavedChart[]
  token: string
  onBack: () => void
}) {
  const canEdit = board.can_edit
  const [widgets, setWidgets] = useState<BoardWidget[]>(board.layout)
  const [cfg, setCfg] = useState<BoardConfig>({
    theme: board.config?.theme ?? "light",
    palette: board.config?.palette ?? "default",
    filters: board.config?.filters ?? [],
    refresh: board.config?.refresh ?? 0,
    variables: board.config?.variables ?? [],
  })
  // current variable values (default-seeded); not persisted — values are per-view
  const [varValues, setVarValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((board.config?.variables ?? []).map((v) => [v.name, v.default ?? ""])))
  const [varsOpen, setVarsOpen] = useState(false)
  const [fields, setFields] = useState<FilterFieldOption[]>([])
  const [adding, setAdding] = useState(false)
  const [addingFilter, setAddingFilter] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)   // auto-refresh (cache OK)
  const [manualNonce, setManualNonce] = useState(0)     // "refresh now" → force fresh
  const [refreshing, setRefreshing] = useState(false)   // a render is in flight → spin the icon
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dark = cfg.theme === "dark"

  // Auto-refresh: re-render every widget on the chosen interval.
  useEffect(() => {
    const secs = cfg.refresh ?? 0
    if (!secs) return
    const id = setInterval(() => setRefreshNonce((n) => n + 1), secs * 1000)
    return () => clearInterval(id)
  }, [cfg.refresh])

  function togglePresent() {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  // Discover filterable fields across the board's charts (runs their queries).
  useEffect(() => {
    if (widgets.length === 0) { setFields([]); return }
    apiGet<FilterFieldOption[]>(`/api/dashboards/${board.id}/fields`, token)
      .then(setFields).catch(() => setFields([]))
  }, [board.id, token, widgets.length])

  const persist = useCallback((next: { layout?: BoardWidget[]; config?: BoardConfig }) => {
    if (!canEdit) return  // view-only: changes aren't saved
    setSaveState("dirty")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving")
      try {
        await apiPut(`/api/dashboards/${board.id}`, next, token)
        setSaveState("saved")
      } catch { setSaveState("dirty") }
    }, 700)
  }, [board.id, token, canEdit])

  function updateLayout(next: BoardWidget[]) {
    setWidgets(next)
    persist({ layout: next })
  }

  function updateConfig(next: BoardConfig) {
    setCfg(next)
    persist({ config: next })
  }

  function addChart(chart: SavedChart) {
    const maxY = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0)
    const next = [...widgets, {
      i: `w${Date.now()}`, chart_id: chart.id,
      x: (widgets.length * 6) % 12, y: maxY, w: 6, h: 8,
    }]
    setAdding(false)
    updateLayout(next)
  }

  function removeWidget(i: string) {
    updateLayout(widgets.filter((w) => w.i !== i))
  }

  function setWidgetFilters(i: string, filters: BoardFilter[]) {
    updateLayout(widgets.map((w) => w.i === i ? { ...w, filters } : w))
  }

  // ── filters ──
  function addFilter(field: FilterFieldOption) {
    setAddingFilter(false)
    const op = field.kind === "num" || field.kind === "time" ? "between"
      : field.values.length ? "in" : "contains"
    updateConfig({ ...cfg, filters: [...cfg.filters, { id: `f${Date.now()}`, column: field.column, op, values: [] }] })
  }
  function updateFilter(id: string, patch: Partial<BoardFilter>) {
    updateConfig({ ...cfg, filters: cfg.filters.map((f) => f.id === id ? { ...f, ...patch } : f) })
  }
  function removeFilter(id: string) {
    updateConfig({ ...cfg, filters: cfg.filters.filter((f) => f.id !== id) })
  }
  const fieldFor = (col: string) => fields.find((f) => f.column === col)
  const usedColumns = new Set(cfg.filters.map((f) => f.column))
  const availableFields = fields.filter((f) => !usedColumns.has(f.column))

  // ── query variables ──
  const variables = cfg.variables ?? []
  function addVar() {
    const names = new Set(variables.map((v) => v.name))
    let name = "var", i = 1
    while (names.has(name)) name = `var${++i}`
    updateConfig({ ...cfg, variables: [...variables, { name, type: "text", default: "" }] })
    setVarValues((vv) => ({ ...vv, [name]: "" }))
  }
  function updateVar(idx: number, patch: Partial<VarDef>) {
    const old = variables[idx]?.name
    if (patch.name) patch.name = patch.name.replace(/[^A-Za-z0-9_]/g, "")  // keep names SQL-safe
    updateConfig({ ...cfg, variables: variables.map((v, i) => i === idx ? { ...v, ...patch } : v) })
    if (patch.name && old && old !== patch.name) {
      setVarValues((vv) => { const c = { ...vv }; c[patch.name!] = c[old] ?? ""; delete c[old]; return c })
    }
  }
  function removeVar(idx: number) {
    const v = variables[idx]
    updateConfig({ ...cfg, variables: variables.filter((_, i) => i !== idx) })
    if (v) setVarValues((vv) => { const c = { ...vv }; delete c[v.name]; return c })
  }

  return (
    <div ref={containerRef} className={`-m-6 p-6 min-h-[calc(100vh-3.5rem)] transition-colors overflow-auto ${dark ? "bg-slate-900" : "bg-slate-50/40"}`}>
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={onBack}
          className={`p-1.5 rounded-lg ${dark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 className={`text-lg font-bold flex-1 ${dark ? "text-white" : "text-slate-900"}`}>{board.name}</h1>

        {/* Refresh-now + auto-refresh interval (native select = always works) */}
        {widgets.length > 0 && (
          <div className={`flex items-center rounded-xl border overflow-hidden ${dark ? "border-slate-700" : "border-slate-200"}`}>
            <button onClick={() => setManualNonce((n) => n + 1)} disabled={refreshing} title="Refresh now (fresh data)"
              className={`px-2.5 py-2 ${dark ? "text-slate-200 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            <div className={`flex items-center gap-1 pl-2 border-l ${dark ? "border-slate-700" : "border-slate-200"}`}>
              {cfg.refresh ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> : null}
              <select value={cfg.refresh ?? 0}
                onChange={(e) => updateConfig({ ...cfg, refresh: Number(e.target.value) })}
                className={`text-xs font-semibold py-2 pr-2 bg-transparent outline-none cursor-pointer ${dark ? "text-slate-200" : "text-slate-600"}`}>
                {REFRESH_OPTIONS.map((o) => (
                  <option key={o.secs} value={o.secs}>{o.label === "Off" ? "Off" : `Every ${o.label}`}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Present / fullscreen */}
        <button onClick={togglePresent} title="Present (fullscreen)"
          className={`p-2 rounded-xl border ${dark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m-4 12h2a2 2 0 002-2v-2"/>
          </svg>
        </button>

        {/* Variables manager */}
        {canEdit && (
        <div className="relative">
          <button onClick={() => setVarsOpen((v) => !v)} title="Query variables — use {{ name }} in a chart's SQL"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors
              ${dark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <span className="font-mono text-[13px]">{"{{}}"}</span>
            Variables{variables.length ? ` (${variables.length})` : ""}
          </button>
          {varsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setVarsOpen(false)} />
              <div className={`absolute right-0 mt-2 w-80 rounded-2xl shadow-xl border z-50 p-4
                ${dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-100"}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${dark ? "text-slate-400" : "text-slate-400"}`}>Query variables</p>
                <p className={`text-[11px] mb-3 ${dark ? "text-slate-500" : "text-slate-400"}`}>
                  Use <code className="font-mono">{"{{ name }}"}</code> in a chart&apos;s SQL. Values are inserted safely (no SQL injection).
                </p>
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {variables.map((v, idx) => (
                    <div key={idx} className={`rounded-xl border p-2.5 space-y-2 ${dark ? "border-slate-700" : "border-slate-100"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[11px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{"{{"}</span>
                        <input value={v.name} onChange={(e) => updateVar(idx, { name: e.target.value })}
                          placeholder="name" className={`flex-1 text-xs font-mono px-2 py-1 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-100" : "border-slate-200"}`} />
                        <span className={`font-mono text-[11px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{"}}"}</span>
                        <button onClick={() => removeVar(idx)} className="text-slate-300 hover:text-red-500 text-sm">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={v.type} onChange={(e) => updateVar(idx, { type: e.target.value })}
                          className={`text-xs px-2 py-1 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-200" : "border-slate-200"}`}>
                          {["text", "number", "date", "select"].map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input value={v.default} onChange={(e) => updateVar(idx, { default: e.target.value })}
                          placeholder="default" className={`text-xs px-2 py-1 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-100" : "border-slate-200"}`} />
                      </div>
                      {v.type === "select" && (
                        <input value={(v.options ?? []).join(", ")} onChange={(e) => updateVar(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                          placeholder="option1, option2, option3" className={`w-full text-xs px-2 py-1 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-100" : "border-slate-200"}`} />
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addVar} className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100">+ Add variable</button>
              </div>
            </>
          )}
        </div>
        )}

        {/* Theme + palette menu */}
        <div className="relative">
          <button onClick={() => setThemeOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors
              ${dark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <span className="flex gap-0.5">
              {PALETTES[cfg.palette].slice(0, 4).map((c) => (
                <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              ))}
            </span>
            Theme
          </button>
          {themeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
              <div className={`absolute right-0 mt-2 w-60 rounded-2xl shadow-xl border z-50 p-4
                ${dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-100"}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${dark ? "text-slate-400" : "text-slate-400"}`}>Appearance</p>
                <div className="flex gap-2 mb-4">
                  {(["light", "dark"] as const).map((t) => (
                    <button key={t} onClick={() => updateConfig({ ...cfg, theme: t })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all
                        ${cfg.theme === t
                          ? "border-blue-400 text-blue-600 bg-blue-50"
                          : dark ? "border-slate-700 text-slate-300" : "border-slate-200 text-slate-500"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${dark ? "text-slate-400" : "text-slate-400"}`}>Colour palette</p>
                <div className="space-y-1">
                  {Object.entries(PALETTES).map(([name, colors]) => (
                    <button key={name} onClick={() => updateConfig({ ...cfg, palette: name })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors
                        ${cfg.palette === name
                          ? (dark ? "bg-slate-700" : "bg-blue-50")
                          : (dark ? "hover:bg-slate-700/50" : "hover:bg-slate-50")}`}>
                      <span className="flex gap-0.5">
                        {colors.map((c) => <span key={c} className="w-3.5 h-3.5 rounded-sm" style={{ background: c }} />)}
                      </span>
                      <span className={`text-xs font-medium capitalize ${dark ? "text-slate-200" : "text-slate-600"}`}>{name}</span>
                      {cfg.palette === name && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {canEdit ? (
          <>
            <span className={`text-[11px] ${saveState === "saved" ? "text-emerald-500" : dark ? "text-slate-500" : "text-slate-400"}`}>
              {saveState === "saved" ? "✓ saved" : saveState === "saving" ? "saving…" : "unsaved changes"}
            </span>
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add chart
            </button>
          </>
        ) : (
          <span className={`text-[11px] font-medium px-2 py-1 rounded-lg ${dark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>View only</span>
        )}
      </div>

      {/* Filter bar */}
      {widgets.length > 0 && (
        <div className={`flex items-center gap-2 flex-wrap mb-4 p-2.5 rounded-xl border
          ${dark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-100"}`}>
          <svg className={`w-4 h-4 ml-1 ${dark ? "text-slate-500" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
          </svg>
          {cfg.filters.length === 0 && (
            <span className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>No filters — add one to slice every chart on this board.</span>
          )}
          {cfg.filters.map((f) => (
            <FilterChip key={f.id} filter={f} field={fieldFor(f.column)} dark={dark}
              onChange={(patch) => updateFilter(f.id, patch)} onRemove={() => removeFilter(f.id)} />
          ))}
          <button onClick={() => setAddingFilter(true)} disabled={availableFields.length === 0}
            title={availableFields.length === 0 ? "No more filterable fields on this board" : "Add a filter"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40
              ${dark ? "text-blue-300 hover:bg-slate-700" : "text-blue-600 hover:bg-blue-50"}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Add filter
          </button>

          {/* Query variable controls */}
          {variables.length > 0 && <div className={`w-px h-5 mx-1 ${dark ? "bg-slate-700" : "bg-slate-200"}`} />}
          {variables.map((v) => (
            <VarControl key={v.name} v={v} dark={dark}
              value={varValues[v.name] ?? v.default ?? ""}
              onChange={(val) => setVarValues((vv) => ({ ...vv, [v.name]: val }))} />
          ))}
        </div>
      )}

      {widgets.length === 0 ? (
        <div className={`rounded-2xl border-2 border-dashed p-16 flex flex-col items-center text-center
          ${dark ? "bg-slate-800/40 border-slate-700" : "bg-white border-slate-200"}`}>
          <p className={`font-medium text-sm mb-1 ${dark ? "text-slate-300" : "text-slate-500"}`}>Empty board</p>
          <p className={`text-xs mb-4 ${dark ? "text-slate-500" : "text-slate-400"}`}>Add your saved charts and arrange them by dragging</p>
          <button onClick={() => setAdding(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
            + Add your first chart
          </button>
        </div>
      ) : (
        <BoardGrid
          dashboardId={board.id}
          widgets={widgets}
          charts={charts}
          token={token}
          filters={cfg.filters}
          palette={cfg.palette}
          theme={cfg.theme}
          variables={varValues}
          refreshNonce={refreshNonce}
          manualNonce={manualNonce}
          onLoadingChange={setRefreshing}
          onLayoutChange={updateLayout}
          onRemoveWidget={removeWidget}
          onWidgetFiltersChange={setWidgetFilters}
        />
      )}

      {/* Add filter modal */}
      {addingFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setAddingFilter(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Add a filter</h2>
            <p className="text-xs text-slate-400 mb-4">Pick a field from your data. It filters every chart that contains it.</p>
            {availableFields.length === 0 ? (
              <p className="text-slate-400 text-sm">No filterable fields found — charts need a low-cardinality column (e.g. status, region, category).</p>
            ) : (
              <div className="space-y-2">
                {availableFields.map((field) => (
                  <button key={field.column} onClick={() => addFilter(field)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm text-left transition-all">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{field.column}</p>
                      <p className="text-[11px] text-slate-400">{field.values.length} values · on {field.charts} chart{field.charts === 1 ? "" : "s"}</p>
                    </div>
                    <span className="text-blue-500 text-lg shrink-0">+</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add chart modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setAdding(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Add a chart</h2>
            {charts.length === 0 ? (
              <p className="text-slate-400 text-sm">No saved charts yet — create one in the Charts section first.</p>
            ) : (
              <div className="space-y-2">
                {charts.map((c) => (
                  <button key={c.id} onClick={() => addChart(c)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm text-left transition-all">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(37,99,235,0.07)" }}>
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-400">{c.chart_type}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

// ── Query variable value control (filter bar) ──────────────────
function VarControl({ v, value, dark, onChange }: {
  v: VarDef; value: string; dark: boolean; onChange: (val: string) => void
}) {
  const base = `text-xs px-2 py-1.5 rounded-lg border outline-none focus:border-blue-400 ${dark ? "bg-slate-700/60 border-slate-600 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"}`
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono text-[11px] ${dark ? "text-slate-400" : "text-slate-500"}`}>{v.name}</span>
      {v.type === "select" ? (
        (v.options ?? []).length === 0 ? (
          <span className={`text-[11px] italic ${dark ? "text-amber-400" : "text-amber-600"}`} title="Open Variables and add options for this select">add options →</span>
        ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">—</option>
          {(v.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        )
      ) : (
        <input type={v.type === "number" ? "number" : v.type === "date" ? "date" : "text"}
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={v.default || "value"}
          className={`${base} w-28`} />
      )}
    </div>
  )
}

// Operators available per column kind + their display symbols
const OP_LABEL: Record<string, string> = {
  in: "is", contains: "contains", eq: "=", neq: "≠",
  between: "between", gt: ">", lt: "<", gte: "≥", lte: "≤",
}
function opsForKind(kind: string | undefined, hasValues: boolean): string[] {
  if (kind === "num") return ["between", "gt", "lt", "gte", "lte", "eq", ...(hasValues ? ["in"] : [])]
  if (kind === "time") return ["between", "gt", "lt", "gte", "lte"]
  return hasValues ? ["in", "contains", "eq", "neq"] : ["contains", "eq", "neq"]
}

// ── Filter chip (operator + adaptive value control) ────────────
function FilterChip({ filter, field, dark, onChange, onRemove }: {
  filter: BoardFilter
  field: FilterFieldOption | undefined
  dark: boolean
  onChange: (patch: Partial<BoardFilter>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const op = filter.op ?? "in"
  const options = field?.values ?? []
  const kind = field?.kind
  const ops = opsForKind(kind, options.length > 0)
  const inputType = kind === "num" ? "number" : kind === "time" ? "date" : "text"
  const selected = new Set(filter.values)

  function summary(): string {
    const v = filter.values.filter((x) => x !== "")
    if (op === "in") return v.length === 0 ? "All" : v.length === 1 ? v[0] : `${v.length} selected`
    if (op === "between") return `${filter.values[0] || "–"} … ${filter.values[1] || "–"}`
    if (v.length === 0) return "any"
    return `${OP_LABEL[op]} ${v[0]}`
  }
  function toggle(val: string) {
    const next = new Set(selected)
    if (next.has(val)) next.delete(val); else next.add(val)
    onChange({ values: [...next] })
  }
  function changeOp(next: string) {
    // moving between single/multi value shapes — reset values to avoid confusion
    onChange({ op: next, values: [] })
  }

  return (
    <div className="relative">
      <div className={`flex items-center gap-1 rounded-lg border text-xs font-medium overflow-hidden
        ${dark ? "border-slate-600 bg-slate-700/60" : "border-slate-200 bg-slate-50"}`}>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5">
          <span className={dark ? "text-slate-400" : "text-slate-500"}>{filter.column}</span>
          <span className={`font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{summary()}</span>
          <svg className={`w-3 h-3 ${dark ? "text-slate-500" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <button onClick={onRemove} title="Remove filter"
          className={`px-1.5 py-1.5 border-l ${dark ? "border-slate-600 text-slate-500 hover:text-red-400" : "border-slate-200 text-slate-400 hover:text-red-500"}`}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 mt-1.5 w-60 rounded-xl shadow-xl border z-50 p-2.5
            ${dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-100"}`}>
            {/* operator selector */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-semibold ${dark ? "text-slate-300" : "text-slate-600"}`}>{filter.column}</span>
              <select value={op} onChange={(e) => changeOp(e.target.value)}
                className={`ml-auto text-[11px] font-medium px-1.5 py-1 rounded-md border outline-none
                  ${dark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-white border-slate-200 text-slate-600"}`}>
                {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
              </select>
            </div>

            {/* value control */}
            {op === "in" ? (
              <div className="max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between px-0.5 pb-1.5 mb-1 border-b border-slate-200/30">
                  <button onClick={() => onChange({ values: [] })} className="text-[11px] font-semibold text-blue-500 hover:underline">Clear</button>
                  <span className={`text-[11px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{options.length} values</span>
                </div>
                {options.length === 0 ? (
                  <p className={`text-xs px-1 py-2 ${dark ? "text-slate-500" : "text-slate-400"}`}>No discrete values — use “contains” instead.</p>
                ) : options.map((v) => (
                  <label key={v} className={`flex items-center gap-2 px-1 py-1.5 rounded-lg cursor-pointer text-xs
                    ${dark ? "hover:bg-slate-700 text-slate-200" : "hover:bg-slate-50 text-slate-700"}`}>
                    <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} className="w-3.5 h-3.5 rounded accent-blue-600" />
                    <span className="truncate">{v}</span>
                  </label>
                ))}
              </div>
            ) : op === "between" ? (
              <div className="flex items-center gap-2">
                <input type={inputType} value={filter.values[0] ?? ""} placeholder="min"
                  onChange={(e) => onChange({ values: [e.target.value, filter.values[1] ?? ""] })}
                  className={`w-full text-xs px-2 py-1.5 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-100" : "border-slate-200"}`} />
                <span className={dark ? "text-slate-500" : "text-slate-400"}>–</span>
                <input type={inputType} value={filter.values[1] ?? ""} placeholder="max"
                  onChange={(e) => onChange({ values: [filter.values[0] ?? "", e.target.value] })}
                  className={`w-full text-xs px-2 py-1.5 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-100" : "border-slate-200"}`} />
              </div>
            ) : (
              <input type={op === "contains" ? "text" : inputType} value={filter.values[0] ?? ""}
                placeholder={op === "contains" ? "search text…" : "value"} autoFocus
                onChange={(e) => onChange({ values: [e.target.value] })}
                className={`w-full text-xs px-2 py-1.5 rounded-md border outline-none ${dark ? "bg-slate-700 border-slate-600 text-slate-100" : "border-slate-200"}`} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
