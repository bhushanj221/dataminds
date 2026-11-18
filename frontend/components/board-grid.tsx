"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import RGL, { WidthProvider, Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import { apiGet, apiPost } from "@/lib/auth-store"

const GridLayout = WidthProvider(RGL)

const PlotlyChart = dynamic(() => import("@/components/plotly-chart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-50 animate-pulse rounded-lg" />,
})

export interface BoardFilter {
  id: string
  column: string
  op?: string          // in | contains | between | eq | neq | gt | lt | gte | lte (default in)
  values: string[]
}

export interface BoardWidget {
  i: string
  chart_id: number
  x: number
  y: number
  w: number
  h: number
  filters?: BoardFilter[]   // per-chart filters (apply only to this widget)
}

interface SavedChart { id: number; name: string; chart_type: string }
interface Figure { data: unknown[]; layout: Record<string, unknown> }
interface FieldOption { column: string; values: string[]; kind?: string }

// Combine board-level + chart-level filters. Same column → the chart-level
// filter wins. Value-less filters are dropped (no constraint).
function mergeFilters(board: BoardFilter[], widget: BoardFilter[] = []) {
  const byCol = new Map<string, BoardFilter>()
  for (const f of board) if (f.values.some((v) => v !== "")) byCol.set(f.column, f)
  for (const f of widget) if (f.values.some((v) => v !== "")) byCol.set(f.column, f)
  return [...byCol.values()].map((f) => ({ column: f.column, op: f.op ?? "in", values: f.values }))
}

// CSV download from a widget's underlying rows
function downloadCSV(name: string, columns: string[], rows: unknown[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [columns.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${(name || "chart").replace(/[^\w.-]+/g, "_")}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Single widget: renders a figure handed down by the board's batch render ──
function WidgetCard({ widget, chartMeta, token, boardFilters, palette, theme, figure, error, loading, onRemove, onFiltersChange }: {
  widget: BoardWidget
  chartMeta: SavedChart | undefined
  token: string
  boardFilters: BoardFilter[]
  palette: string
  theme: string
  figure: Figure | null
  error: string | null
  loading: boolean
  onRemove: () => void
  onFiltersChange: (filters: BoardFilter[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [csvBusy, setCsvBusy] = useState(false)
  const dark = theme === "dark"
  const title = chartMeta?.name ?? `Chart #${widget.chart_id}`
  const fig = figure
  const err = error ?? ""

  const widgetFilters = widget.filters ?? []
  const merged = mergeFilters(boardFilters, widgetFilters)

  // Rows aren't sent with the batch (figures only). Fetch them on demand for CSV.
  async function exportCSV() {
    setCsvBusy(true)
    try {
      const r = await apiPost<{ columns: string[]; rows: unknown[][] }>(
        `/api/charts/${widget.chart_id}/render`, { filters: merged, palette, theme }, token)
      downloadCSV(title, r.columns ?? [], r.rows ?? [])
    } catch { /* ignore */ } finally { setCsvBusy(false) }
  }

  const activeCount = widgetFilters.filter((f) => f.values.length).length
  const iconBtn = `opacity-0 group-hover:opacity-100 transition-opacity p-0.5 ${dark ? "text-slate-400 hover:text-slate-100" : "text-slate-300 hover:text-slate-600"}`

  return (
    <div className={`h-full w-full rounded-xl border shadow-sm overflow-hidden flex flex-col group transition-colors
      ${dark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-100"}`}>
      <div className={`drag-handle flex items-center justify-between px-3 py-1.5 border-b cursor-move shrink-0
        ${dark ? "border-slate-700" : "border-slate-50"}`}>
        <p className={`text-[11px] font-semibold truncate ${dark ? "text-slate-200" : "text-slate-600"}`}>{title}</p>
        <div className="flex items-center gap-0.5 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          <ChartFilterButton
            chartId={widget.chart_id} token={token} dark={dark}
            filters={widgetFilters} activeCount={activeCount} onChange={onFiltersChange} />
          <button onClick={exportCSV} title="Export CSV"
            disabled={csvBusy || !fig} className={`${iconBtn} disabled:opacity-30`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </button>
          <button onClick={() => setExpanded(true)} title="Expand" className={iconBtn}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
            </svg>
          </button>
          <button onClick={onRemove} title="Remove" className={`${iconBtn} hover:!text-red-500`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-1">
        {err ? (
          <div className="h-full flex items-center justify-center text-red-400 text-[11px] px-3 text-center">{err}</div>
        ) : (loading || !fig) ? (
          <div className={`h-full rounded-lg animate-pulse ${dark ? "bg-slate-700/50" : "bg-slate-50"}`} />
        ) : (
          <PlotlyChart figure={{ ...fig, layout: { ...fig.layout, margin: { l: 40, r: 12, t: 16, b: 32 } } }} />
        )}
      </div>

      {/* Expand / focus modal — portalled to <body> so it escapes the
          react-grid-layout item's CSS transform (which would otherwise trap
          a position:fixed element inside the panel instead of the viewport). */}
      {expanded && fig && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] flex" onMouseDown={(e) => e.stopPropagation()}>
          <div className={`relative w-screen h-screen flex flex-col overflow-hidden
            ${dark ? "bg-slate-800" : "bg-white"}`}>
            <div className={`flex items-center justify-between px-5 py-3 border-b ${dark ? "border-slate-700" : "border-slate-100"}`}>
              <p className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>{title}</p>
              <div className="flex items-center gap-2">
                <button onClick={exportCSV} disabled={csvBusy}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg border disabled:opacity-40
                    ${dark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {csvBusy ? "Exporting…" : "Export CSV"}
                </button>
                <button onClick={() => setExpanded(false)} className={`p-1 rounded-lg ${dark ? "text-slate-400 hover:bg-slate-700" : "text-slate-400 hover:bg-slate-100"}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <PlotlyChart figure={{ ...fig, layout: { ...fig.layout, margin: { l: 50, r: 20, t: 24, b: 44 } } }} className="w-full h-full" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Per-chart filter control (funnel + popover) ────────────────
function ChartFilterButton({ chartId, token, dark, filters, activeCount, onChange }: {
  chartId: number
  token: string
  dark: boolean
  filters: BoardFilter[]
  activeCount: number
  onChange: (filters: BoardFilter[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<FieldOption[] | null>(null)

  useEffect(() => {
    if (!open || fields) return
    apiGet<FieldOption[]>(`/api/charts/${chartId}/fields`, token)
      .then(setFields).catch(() => setFields([]))
  }, [open, fields, chartId, token])

  function valuesFor(col: string) { return fields?.find((f) => f.column === col)?.values ?? [] }
  function setColValues(col: string, values: string[]) {
    const others = filters.filter((f) => f.column !== col)
    onChange(values.length ? [...others, { id: `c${col}`, column: col, values }] : others)
  }
  function selected(col: string) { return new Set(filters.find((f) => f.column === col)?.values ?? []) }
  function toggle(col: string, v: string) {
    const s = selected(col)
    if (s.has(v)) s.delete(v); else s.add(v)
    setColValues(col, [...s])
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} title="Filter this chart"
        className={`relative p-0.5 transition-colors ${activeCount > 0
          ? "text-blue-500" : `opacity-0 group-hover:opacity-100 ${dark ? "text-slate-400 hover:text-slate-200" : "text-slate-300 hover:text-slate-600"}`}`}>
        <svg className="w-3.5 h-3.5" fill={activeCount > 0 ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
        </svg>
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center">{activeCount}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 mt-1.5 w-60 max-h-80 overflow-y-auto rounded-xl shadow-xl border z-50 p-2.5 text-left cursor-default
            ${dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-100"}`}>
            <p className={`text-[11px] font-bold uppercase tracking-wide px-1 mb-1.5 ${dark ? "text-slate-400" : "text-slate-400"}`}>Filter this chart</p>
            {fields === null ? (
              <p className={`text-xs px-1 py-2 ${dark ? "text-slate-500" : "text-slate-400"}`}>Loading fields…</p>
            ) : fields.filter((f) => f.values.length).length === 0 ? (
              <p className={`text-xs px-1 py-2 ${dark ? "text-slate-500" : "text-slate-400"}`}>No quick-pick fields here. Use the board filter bar for ranges & search.</p>
            ) : fields.filter((f) => f.values.length).map((field) => {
              const sel = selected(field.column)
              return (
                <div key={field.column} className="mb-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className={`text-[11px] font-semibold ${dark ? "text-slate-200" : "text-slate-600"}`}>{field.column}</span>
                    {sel.size > 0 && (
                      <button onClick={() => setColValues(field.column, [])} className="text-[10px] text-blue-500 hover:underline">clear</button>
                    )}
                  </div>
                  <div className="mt-0.5 max-h-28 overflow-y-auto">
                    {valuesFor(field.column).map((v) => (
                      <label key={v} className={`flex items-center gap-2 px-1 py-1 rounded-md cursor-pointer text-xs
                        ${dark ? "hover:bg-slate-700 text-slate-300" : "hover:bg-slate-50 text-slate-600"}`}>
                        <input type="checkbox" checked={sel.has(v)} onChange={() => toggle(field.column, v)}
                          className="w-3.5 h-3.5 rounded accent-blue-600" />
                        <span className="truncate">{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

interface PanelResult { i: string; chart_id: number; figure: Figure | null; error: string | null }

// ── Board ──────────────────────────────────────────────────────
export default function BoardGrid({ dashboardId, widgets, charts, token, filters, palette, theme, variables = {}, refreshNonce = 0, manualNonce = 0, onLoadingChange, onLayoutChange, onRemoveWidget, onWidgetFiltersChange }: {
  dashboardId: number
  widgets: BoardWidget[]
  charts: SavedChart[]
  token: string
  filters: BoardFilter[]
  palette: string
  theme: string
  variables?: Record<string, string>
  refreshNonce?: number
  manualNonce?: number
  onLoadingChange?: (loading: boolean) => void
  onLayoutChange: (widgets: BoardWidget[]) => void
  onRemoveWidget: (i: string) => void
  onWidgetFiltersChange: (i: string, filters: BoardFilter[]) => void
}) {
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets

  // One batch render for the whole board → fast load, fewer round-trips.
  const [panels, setPanels] = useState<Record<string, { figure: Figure | null; error: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const lastManual = useRef(manualNonce)

  // re-render when board filters, per-widget filters, palette, theme, or refresh change
  const widgetFilterKey = JSON.stringify(widgets.map((w) => [w.i, w.chart_id, w.filters ?? []]))
  const boardFilterKey = JSON.stringify(filters.map((f) => [f.column, f.op ?? "in", f.values]))
  const varsKey = JSON.stringify(variables)

  useEffect(() => {
    let alive = true
    const fresh = manualNonce !== lastManual.current   // only a manual "refresh now" forces fresh
    lastManual.current = manualNonce
    setLoading(true); onLoadingChange?.(true)
    const done = () => { if (alive) { setLoading(false); onLoadingChange?.(false) } }
    apiPost<{ widgets: PanelResult[] }>(`/api/dashboards/${dashboardId}/render`, {
      filters: filters.map((f) => ({ column: f.column, op: f.op ?? "in", values: f.values })),
      palette, theme, fresh, variables,
    }, token)
      .then((r) => {
        if (!alive) return
        const m: Record<string, { figure: Figure | null; error: string | null }> = {}
        for (const p of r.widgets) m[p.i] = { figure: p.figure, error: p.error }
        setPanels(m)
        done()
      })
      .catch(done)
    return () => { alive = false }
  }, [dashboardId, token, boardFilterKey, widgetFilterKey, varsKey, palette, theme, refreshNonce, manualNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((layout: Layout[]) => {
    const merged = widgetsRef.current.map((w) => {
      const l = layout.find((item) => item.i === w.i)
      return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w
    })
    onLayoutChange(merged)
  }, [onLayoutChange])

  // Plotly only listens to window resize — poke it after drag/resize
  const pokePlotly = () => setTimeout(() => window.dispatchEvent(new Event("resize")), 50)

  return (
    <GridLayout
      className="layout"
      layout={widgets.map((w) => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3 }))}
      cols={12}
      rowHeight={42}
      margin={[12, 12]}
      draggableHandle=".drag-handle"
      onLayoutChange={handleChange}
      onResizeStop={pokePlotly}
      onDragStop={pokePlotly}
    >
      {widgets.map((w) => {
        const p = panels[w.i]
        return (
        <div key={w.i}>
          <WidgetCard
            widget={w}
            chartMeta={charts.find((c) => c.id === w.chart_id)}
            token={token}
            boardFilters={filters}
            palette={palette}
            theme={theme}
            figure={p?.figure ?? null}
            error={p?.error ?? null}
            loading={loading && !p}
            onRemove={() => onRemoveWidget(w.i)}
            onFiltersChange={(f) => onWidgetFiltersChange(w.i, f)}
          />
        </div>
        )
      })}
    </GridLayout>
  )
}
