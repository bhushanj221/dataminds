"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuthStore, apiGet } from "@/lib/auth-store"

interface Node { id: string; type: string; label: string; meta: Record<string, any> }
interface Edge { from: string; to: string; kind: string }
interface Graph { nodes: Node[]; edges: Edge[]; counts: Record<string, number> }
interface ColLineage {
  output_columns: { output: string; sources: string[] }[]
  tables: string[]; star: boolean; error?: string
}
const COLUMN_NODE_TYPES = ["chart", "kpi", "report"]

// column assignment + styling per node type
const COLUMNS: { title: string; types: string[] }[] = [
  { title: "Sources", types: ["source"] },
  { title: "Tables", types: ["table"] },
  { title: "Charts · KPIs · Reports", types: ["chart", "kpi", "report"] },
  { title: "Dashboards · Alerts", types: ["dashboard", "alert"] },
]
const TYPE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  source:    { color: "#2563eb", bg: "#eff6ff", label: "Source" },
  table:     { color: "#475569", bg: "#f1f5f9", label: "Table" },
  chart:     { color: "#7c3aed", bg: "#f5f3ff", label: "Chart" },
  kpi:       { color: "#059669", bg: "#ecfdf5", label: "KPI" },
  report:    { color: "#d97706", bg: "#fffbeb", label: "Report" },
  dashboard: { color: "#4338ca", bg: "#eef2ff", label: "Dashboard" },
  alert:     { color: "#e11d48", bg: "#fff1f2", label: "Alert" },
}

const COL_W = 230, COL_X0 = 20, ROW_H = 58, ROW_Y0 = 44, NODE_W = 196, NODE_H = 44

export default function LineagePage() {
  const token = useAuthStore((s) => s.token)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [colLin, setColLin] = useState<ColLineage | null>(null)
  const [colLoading, setColLoading] = useState(false)

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    apiGet<Graph>("/api/lineage/graph", token).then(setGraph).catch(() => setGraph(null)).finally(() => setLoading(false))
  }, [token])
  useEffect(() => { load() }, [load])

  // load column-level lineage when a SQL asset is selected
  useEffect(() => {
    const node = graph?.nodes.find((n) => n.id === selected)
    if (!token || !node || !COLUMN_NODE_TYPES.includes(node.type)) { setColLin(null); return }
    let active = true
    setColLoading(true); setColLin(null)
    apiGet<ColLineage>(`/api/lineage/columns?node=${encodeURIComponent(selected!)}`, token)
      .then((r) => { if (active) setColLin(r) })
      .catch(() => { if (active) setColLin(null) })
      .finally(() => { if (active) setColLoading(false) })
    return () => { active = false }
  }, [selected, token, graph])

  // ── layout: position each node in its column ──
  const layout = useMemo(() => {
    const pos: Record<string, { x: number; y: number; col: number }> = {}
    let maxRows = 0
    if (graph) {
      COLUMNS.forEach((col, ci) => {
        const colNodes = graph.nodes.filter((n) => col.types.includes(n.type))
        colNodes.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label))
        colNodes.forEach((n, ri) => { pos[n.id] = { x: COL_X0 + ci * COL_W, y: ROW_Y0 + ri * ROW_H, col: ci } })
        maxRows = Math.max(maxRows, colNodes.length)
      })
    }
    return { pos, height: ROW_Y0 + maxRows * ROW_H + 20, width: COL_X0 + COLUMNS.length * COL_W }
  }, [graph])

  // ── adjacency for highlight tracing ──
  const { downAdj, upAdj } = useMemo(() => {
    const d: Record<string, string[]> = {}, u: Record<string, string[]> = {}
    graph?.edges.forEach((e) => { (d[e.from] ||= []).push(e.to); (u[e.to] ||= []).push(e.from) })
    return { downAdj: d, upAdj: u }
  }, [graph])

  function walk(start: string, adj: Record<string, string[]>): Set<string> {
    const seen = new Set<string>(), stack = [...(adj[start] || [])]
    while (stack.length) { const c = stack.pop()!; if (seen.has(c)) continue; seen.add(c); stack.push(...(adj[c] || [])) }
    return seen
  }

  const trace = useMemo(() => {
    if (!selected) return null
    const down = walk(selected, downAdj), up = walk(selected, upAdj)
    const connected = new Set<string>([selected, ...down, ...up])
    const counts: Record<string, number> = {}
    graph?.nodes.forEach((n) => { if (down.has(n.id)) counts[n.type] = (counts[n.type] || 0) + 1 })
    return { down, up, connected, counts }
  }, [selected, downAdj, upAdj, graph])

  const selectedNode = graph?.nodes.find((n) => n.id === selected) || null

  function edgePath(from: string, to: string): string {
    const a = layout.pos[from], b = layout.pos[to]
    if (!a || !b) return ""
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2
    const mx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Lineage</h1>
          <p className="text-slate-500 text-sm mt-1">How your data flows — click any asset to trace what feeds it and what it impacts.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* legend + counts */}
      {graph && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {Object.entries(TYPE_STYLE).map(([t, s]) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg" style={{ background: s.bg, color: s.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              {s.label} {graph.counts[t] ? `(${graph.counts[t]})` : ""}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-72 bg-slate-50 animate-pulse rounded-2xl" />
      ) : !graph || graph.nodes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <h3 className="font-semibold text-slate-800">Nothing to map yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Connect a source and create a chart, KPI, or report — lineage builds itself from what your assets query.</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* graph canvas */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-auto" style={{ maxHeight: "72vh" }}>
            <div className="relative" style={{ width: layout.width, height: layout.height, minWidth: "100%" }}>
              {/* column headers */}
              {COLUMNS.map((c, ci) => (
                <div key={c.title} className="absolute text-[11px] font-bold text-slate-400 uppercase tracking-wide"
                  style={{ left: COL_X0 + ci * COL_W, top: 14, width: NODE_W }}>{c.title}</div>
              ))}

              {/* edges */}
              <svg className="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height}>
                {graph.edges.map((e, i) => {
                  const active = trace ? (trace.connected.has(e.from) && trace.connected.has(e.to)) : false
                  const dim = trace && !active
                  return <path key={i} d={edgePath(e.from, e.to)} fill="none"
                    stroke={active ? "#2563eb" : "#cbd5e1"} strokeWidth={active ? 2 : 1.2}
                    opacity={dim ? 0.25 : 1} />
                })}
              </svg>

              {/* nodes */}
              {graph.nodes.map((n) => {
                const p = layout.pos[n.id]; if (!p) return null
                const s = TYPE_STYLE[n.type]
                const isSel = selected === n.id
                const inTrace = !trace || trace.connected.has(n.id)
                return (
                  <button key={n.id} onClick={() => setSelected(isSel ? null : n.id)}
                    className="absolute rounded-xl border text-left px-3 transition-all"
                    style={{
                      left: p.x, top: p.y, width: NODE_W, height: NODE_H,
                      background: s.bg, borderColor: isSel ? s.color : "transparent",
                      boxShadow: isSel ? `0 0 0 2px ${s.color}` : "0 1px 2px rgba(0,0,0,0.04)",
                      opacity: inTrace ? 1 : 0.3,
                    }}>
                    <div className="flex items-center gap-2 h-full">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{n.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight">{s.label}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* impact panel */}
          <div className="w-72 shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sticky top-0">
              {!selectedNode ? (
                <div className="text-center py-8">
                  <svg className="w-8 h-8 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <p className="text-sm text-slate-500">Click any node to trace its lineage and impact.</p>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: TYPE_STYLE[selectedNode.type].bg, color: TYPE_STYLE[selectedNode.type].color }}>
                    {TYPE_STYLE[selectedNode.type].label}
                  </span>
                  <h3 className="font-bold text-slate-900 mt-2 break-words">{selectedNode.label}</h3>

                  {trace && Object.keys(trace.counts).length > 0 ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-rose-700">⚠ Impact if changed/removed</p>
                      <p className="text-[11px] text-slate-500 mb-2">Downstream assets that depend on this:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(trace.counts).map(([t, c]) => (
                          <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-lg"
                            style={{ background: TYPE_STYLE[t].bg, color: TYPE_STYLE[t].color }}>
                            {c} {TYPE_STYLE[t].label.toLowerCase()}{c > 1 ? "s" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-4">Nothing downstream depends on this — safe to change.</p>
                  )}

                  {trace && trace.up.size > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-600 mb-1.5">Upstream (where it comes from)</p>
                      <div className="space-y-1">
                        {graph!.nodes.filter((n) => trace.up.has(n.id)).map((n) => (
                          <div key={n.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_STYLE[n.type].color }} />
                            <span className="truncate">{n.label}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-[10px] text-slate-400">{TYPE_STYLE[n.type].label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Column-level lineage (assets only) */}
                  {COLUMN_NODE_TYPES.includes(selectedNode.type) && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-600 mb-1.5">Column lineage</p>
                      {colLoading ? (
                        <p className="text-[11px] text-slate-400">Tracing columns…</p>
                      ) : !colLin ? (
                        <p className="text-[11px] text-slate-400">Couldn’t parse this query’s columns.</p>
                      ) : colLin.error ? (
                        <p className="text-[11px] text-amber-600">{colLin.error}</p>
                      ) : (
                        <div className="space-y-1.5">
                          {colLin.star && (
                            <p className="text-[11px] text-slate-500 italic">SELECT * — all columns from {colLin.tables.join(", ") || "source"}</p>
                          )}
                          {colLin.output_columns.map((oc) => (
                            <div key={oc.output} className="text-[11px]">
                              <span className="font-mono font-semibold text-slate-700">{oc.output}</span>
                              {oc.sources.length > 0 ? (
                                <span className="text-slate-400"> ← <span className="font-mono text-slate-600">{oc.sources.join(", ")}</span></span>
                              ) : (
                                <span className="text-slate-300"> ← (computed / no direct column)</span>
                              )}
                            </div>
                          ))}
                          {colLin.output_columns.length === 0 && !colLin.star && (
                            <p className="text-[11px] text-slate-400">No output columns detected.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={() => setSelected(null)} className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium">Clear selection</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
