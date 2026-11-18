"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore, apiGet } from "@/lib/auth-store"

interface SearchResult { type: string; id: number; name: string; subtitle: string | null; href: string }

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  source:    { label: "Source", color: "#2563eb", bg: "#eff6ff" },
  chart:     { label: "Chart", color: "#7c3aed", bg: "#f5f3ff" },
  dashboard: { label: "Dashboard", color: "#4338ca", bg: "#eef2ff" },
  kpi:       { label: "KPI", color: "#059669", bg: "#ecfdf5" },
  report:    { label: "Report", color: "#d97706", bg: "#fffbeb" },
  metric:    { label: "Metric", color: "#0891b2", bg: "#ecfeff" },
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const token = useAuthStore((s) => s.token)
  const router = useRouter()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQ(""); setResults([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  // debounced search
  useEffect(() => {
    if (!token || q.trim().length < 2) { setResults([]); return }
    let active = true
    setLoading(true)
    const id = setTimeout(() => {
      apiGet<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`, token)
        .then((r) => { if (active) { setResults(r.results); setActive(0) } })
        .catch(() => { if (active) setResults([]) })
        .finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; clearTimeout(id) }
  }, [q, token])

  const go = useCallback((r: SearchResult) => { onClose(); router.push(r.href) }, [onClose, router])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]) }
    else if (e.key === "Escape") { onClose() }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* input */}
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search sources, charts, dashboards, KPIs, reports…"
            className="flex-1 py-3.5 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-mono shrink-0">esc</kbd>
        </div>

        {/* results */}
        <div className="max-h-80 overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Type at least 2 characters to search your workspace.</p>
          ) : loading && results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No matches for “{q.trim()}”.</p>
          ) : (
            <div className="py-1">
              {results.map((r, i) => {
                const m = TYPE_META[r.type] || { label: r.type, color: "#64748b", bg: "#f1f5f9" }
                return (
                  <button key={`${r.type}-${r.id}`} onClick={() => go(r)} onMouseEnter={() => setActive(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? "bg-slate-50" : ""}`}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg shrink-0 w-20 text-center"
                      style={{ background: m.bg, color: m.color }}>{m.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                      {r.subtitle && <p className="text-xs text-slate-400 truncate">{r.subtitle}</p>}
                    </div>
                    {i === active && <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 font-mono shrink-0">↵</kbd>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
