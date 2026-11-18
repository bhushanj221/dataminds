"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useAuthStore, apiGet, apiPost, apiPut, apiDelete } from "@/lib/auth-store"
import { CHART_TYPES, CHART_GROUPS, ChartType } from "@/lib/chart-catalog"

const PlotlyChart = dynamic(() => import("@/components/plotly-chart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />,
})

// Chart-level colour choices (mirror backend PALETTES + Plotly continuous scales)
const PALETTE_NAMES = ["default", "ocean", "sunset", "forest", "berry", "slate", "vibrant"]
const COLOR_SCALES = ["Blues", "Teal", "Greens", "Purples", "OrRd", "Viridis", "Cividis", "Turbo", "Plasma", "RdBu"]
const CONTINUOUS_TYPES = new Set(["heatmap", "density_heatmap", "choropleth", "surface_3d", "parallel", "map_density"])
const MAP_STYLES = ["streets", "light", "dark", "terrain", "satellite"]

interface Source { id: number; name: string; type: string }
interface SavedChart {
  id: number; name: string; chart_type: string; source_id: number
  sql: string; config: Record<string, unknown>; updated_at: string
}
interface Figure { data: unknown[]; layout: Record<string, unknown> }
interface Suggestion { chart_type: string; config: Record<string, unknown>; label: string; reason: string; figure: Figure }

export default function ChartsPage() {
  const token = useAuthStore((s) => s.token)
  const [mode, setMode] = useState<"list" | "build">("list")
  const [charts, setCharts] = useState<SavedChart[]>([])
  const [editChart, setEditChart] = useState<SavedChart | null>(null)
  const [pin, setPin] = useState<{ source_id: number; sql: string } | null>(null)

  const loadCharts = useCallback(() => {
    if (!token) return
    apiGet<SavedChart[]>("/api/charts", token).then(setCharts).catch(() => {})
  }, [token])

  useEffect(() => { loadCharts() }, [loadCharts])

  // Arriving from SQL editor "Pin to chart"
  useEffect(() => {
    const raw = sessionStorage.getItem("dm_pin")
    if (raw) {
      sessionStorage.removeItem("dm_pin")
      try { setPin(JSON.parse(raw)); setMode("build") } catch {}
    }
  }, [])

  if (mode === "build") {
    return (
      <ChartBuilder
        token={token!}
        initial={editChart}
        pin={pin}
        onDone={() => { setMode("list"); setEditChart(null); setPin(null); loadCharts() }}
      />
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Charts</h1>
          <p className="text-slate-400 text-sm mt-0.5">{CHART_TYPES.length} chart types — bars to geo maps</p>
        </div>
        <button onClick={() => { setEditChart(null); setMode("build") }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          New chart
        </button>
      </div>

      {charts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(37,99,235,0.07)" }}>
            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <p className="text-slate-700 font-semibold mb-1">No charts yet</p>
          <p className="text-slate-400 text-sm mb-5 max-w-sm">Build your first chart from any connected data source, or pin a result from the SQL editor.</p>
          <button onClick={() => setMode("build")}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
            Create a chart
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {charts.map((c) => {
            const meta = CHART_TYPES.find((t) => t.id === c.chart_type)
            return (
              <SavedChartCard key={c.id} chart={c} meta={meta} token={token!}
                onEdit={() => { setEditChart(c); setMode("build") }}
                onDelete={async () => {
                  if (!confirm(`Delete chart "${c.name}"?`)) return
                  await apiDelete(`/api/charts/${c.id}`, token!)
                  loadCharts()
                }} />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Saved chart card with live thumbnail ───────────────────────
function SavedChartCard({ chart, meta, token, onEdit, onDelete }: {
  chart: SavedChart; meta: ChartType | undefined; token: string
  onEdit: () => void; onDelete: () => void
}) {
  const [fig, setFig] = useState<Figure | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    apiGet<{ figure: Figure }>(`/api/charts/${chart.id}/render`, token)
      .then((r) => setFig(r.figure))
      .catch(() => setErr(true))
  }, [chart.id, token])

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-44 border-b border-slate-50 relative">
        {err ? (
          <div className="h-full flex items-center justify-center text-red-400 text-xs">failed to render</div>
        ) : !fig ? (
          <div className="h-full bg-slate-50 animate-pulse" />
        ) : (
          <PlotlyChart figure={{ ...fig, layout: { ...fig.layout, margin: { l: 32, r: 12, t: 12, b: 28 } } }} />
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-slate-900 font-semibold text-sm truncate">{chart.name}</p>
            <p className="text-slate-400 text-[11px]">{meta?.label ?? chart.chart_type}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="text-[11px] font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg">Edit</button>
            <button onClick={onDelete} className="text-[11px] font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg">Delete</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Builder ────────────────────────────────────────────────────
function ChartBuilder({ token, initial, pin, onDone }: {
  token: string
  initial: SavedChart | null
  pin: { source_id: number; sql: string } | null
  onDone: () => void
}) {
  const [sources, setSources] = useState<Source[]>([])
  const [name, setName] = useState(initial?.name ?? "")
  const [sourceId, setSourceId] = useState<number | null>(initial?.source_id ?? pin?.source_id ?? null)
  const [sql, setSql] = useState(initial?.sql ?? pin?.sql ?? "SELECT ")
  const [chartType, setChartType] = useState<string>(initial?.chart_type ?? "bar")
  const [config, setConfig] = useState<Record<string, unknown>>(initial?.config ?? {})
  const [columns, setColumns] = useState<string[]>([])
  const [figure, setFigure] = useState<Figure | null>(null)
  const [rowCount, setRowCount] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)

  const selected = useMemo(() => CHART_TYPES.find((t) => t.id === chartType)!, [chartType])
  const options = (config.options as Record<string, unknown>) ?? {}
  const setOpt = (patch: Record<string, unknown>) =>
    setConfig({ ...config, options: { ...options, ...patch } })
  const seriesNames = useMemo(() => (
    Array.isArray(config.y) ? (config.y as string[]) : config.y ? [config.y as string] : []
  ), [config.y])

  const AGGREGATING = new Set([
    "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100",
    "line", "line_smooth", "line_step", "area", "area_stacked",
    "pie", "donut", "funnel", "radar", "waterfall", "choropleth",
  ])

  // Switching chart type: keep only fields the new type has, and fix
  // multi/single shape mismatches (y can be array for bar, string for pie)
  function switchType(newType: string) {
    const meta = CHART_TYPES.find((t) => t.id === newType)!
    const next: Record<string, unknown> = {}
    if (config.agg) next.agg = config.agg
    if (config.options) next.options = config.options   // keep panel options across type switch
    meta.fields.forEach((f) => {
      const old = config[f.key]
      if (old === undefined || old === null || old === "") return
      if (f.multi) next[f.key] = Array.isArray(old) ? old : [old]
      else next[f.key] = Array.isArray(old) ? old[0] : old
    })
    setChartType(newType)
    setConfig(next)
  }

  useEffect(() => {
    apiGet<Source[]>("/api/sources", token).then((s) => {
      setSources(s)
      if (!sourceId && s.length > 0) setSourceId(s[0].id)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Run preview
  const preview = useCallback(async () => {
    if (!sourceId || !sql.trim()) return
    setLoading(true); setError("")
    try {
      const r = await apiPost<{ figure: Figure; columns: string[]; row_count: number }>(
        "/api/charts/preview",
        { source_id: sourceId, sql, chart_type: chartType, config },
        token)
      setFigure(r.figure); setColumns(r.columns); setRowCount(r.row_count)
    } catch (e) {
      setFigure(null)
      setError(e instanceof Error ? e.message : "Preview failed")
      // still try to fetch columns so mapping selects populate
      try {
        const q = await apiPost<{ columns: string[] }>(
          `/api/sources/${sourceId}/query`, { sql, limit: 1 }, token)
        setColumns(q.columns)
      } catch { /* sql itself is broken */ }
    } finally {
      setLoading(false)
    }
  }, [token, sourceId, sql, chartType, config])

  // required fields mapped for current type?
  const missingFields = useMemo(() => {
    return selected.fields
      .filter((f) => {
        if (!f.required) return false
        const v = config[f.key]
        return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)
      })
      .map((f) => f.label)
  }, [selected, config])

  // auto-preview when type/config change — only once mappings are complete
  useEffect(() => {
    if (columns.length > 0 && missingFields.length === 0) preview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, config])

  async function save() {
    if (!name.trim()) { setError("Give the chart a name"); return }
    if (!sourceId) { setError("Pick a data source"); return }
    setSaving(true); setError("")
    try {
      const payload = { name, chart_type: chartType, source_id: sourceId, sql, config }
      if (initial) {
        await apiPut(`/api/charts/${initial.id}`, payload, token)
      } else {
        await apiPost("/api/charts", payload, token)
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const fetchSuggestions = useCallback(async () => {
    if (!sourceId || !sql.trim()) return
    setSuggestLoading(true)
    try {
      const r = await apiPost<{ suggestions: Suggestion[] }>(
        "/api/charts/suggest", { source_id: sourceId, sql }, token)
      setSuggestions(r.suggestions)
    } catch { setSuggestions([]) } finally { setSuggestLoading(false) }
  }, [token, sourceId, sql])

  function openSuggestions() {
    setShowSuggest(true)
    if (!suggestions && !suggestLoading) fetchSuggestions()
  }

  function applySuggestion(s: Suggestion) {
    setChartType(s.chart_type)
    setConfig(Object.keys(options).length ? { ...s.config, options } : { ...s.config })
    setShowSuggest(false)
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 bg-white"

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onDone} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Untitled chart"
          className="text-lg font-bold text-slate-900 bg-transparent outline-none placeholder-slate-300 flex-1" />
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
          {saving ? "Saving…" : initial ? "Update chart" : "Save chart"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr_300px] gap-4">
        {/* ── Left: config panel ── */}
        <div className="space-y-4">
          {/* Data */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Data</p>
            <select value={sourceId ?? ""} onChange={(e) => setSourceId(Number(e.target.value))} className={inputCls}>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea value={sql} onChange={(e) => setSql(e.target.value)}
              rows={5} spellCheck={false}
              className={`${inputCls} font-mono text-xs resize-y`}
              placeholder="SELECT region, SUM(amount) AS total FROM orders GROUP BY region" />
            <button onClick={preview} disabled={loading || !sourceId}
              className="w-full py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {loading ? "Running…" : "Run query ▶"}
            </button>
            {rowCount > 0 && <p className="text-[11px] text-slate-400">{rowCount} rows · {columns.length} columns</p>}
          </div>

          {/* Chart type */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Chart type</p>
            <div className="max-h-72 overflow-y-auto pr-1 -mr-1">
              {CHART_GROUPS.map((g) => (
                <div key={g} className="mb-3">
                  <p className="text-[10px] text-slate-400 mb-1.5 sticky top-0 bg-white">{g}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CHART_TYPES.filter((t) => t.group === g).map((t) => (
                      <button key={t.id} onClick={() => switchType(t.id)} title={t.label}
                        className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium text-center leading-tight transition-colors border ${
                          chartType === t.id
                            ? "border-blue-400 text-blue-700"
                            : "border-slate-100 text-slate-600 hover:border-slate-300"
                        }`}
                        style={chartType === t.id ? { background: "rgba(37,99,235,0.06)" } : {}}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Field mapping */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fields</p>
            {["map_scatter", "map_density", "geo_scatter"].includes(chartType) && (
              <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-[11px] text-blue-800 leading-snug">
                  Needs a numeric <b>Latitude</b> and <b>Longitude</b> column. Columns named lat/latitude and
                  lon/lng/longitude map automatically — otherwise pick them below (e.g. a column called <code className="font-mono">log</code>).
                </p>
              </div>
            )}
            {chartType === "choropleth" && (
              <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-[11px] text-blue-800 leading-snug">
                  Needs a <b>country</b> column (names like &ldquo;India&rdquo; or ISO-3 codes) and a numeric <b>value</b> to color by.
                </p>
              </div>
            )}
            {selected.hint && <p className="text-[11px] text-slate-400">{selected.hint}</p>}
            {selected.fields.length === 0 && <p className="text-[11px] text-slate-400">No mapping needed.</p>}
            {selected.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                {f.multi ? (
                  <MultiColumnSelect
                    columns={columns}
                    value={Array.isArray(config[f.key]) ? (config[f.key] as string[]) : config[f.key] ? [config[f.key] as string] : []}
                    onChange={(v) => setConfig({ ...config, [f.key]: v })}
                  />
                ) : (
                  <select
                    value={(Array.isArray(config[f.key]) ? (config[f.key] as string[])[0] : (config[f.key] as string)) ?? ""}
                    onChange={(e) => setConfig({ ...config, [f.key]: e.target.value || undefined })}
                    className={inputCls}>
                    <option value="">— select column —</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            ))}

            {/* Aggregation — how duplicate categories are combined */}
            {AGGREGATING.has(chartType) && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Aggregation</label>
                <select
                  value={(config.agg as string) ?? "sum"}
                  onChange={(e) => setConfig({ ...config, agg: e.target.value })}
                  className={inputCls}>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="count">Count</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Applied when multiple rows share the same category</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Center: live preview / suggestions ── */}
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col min-h-[560px]">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700">
              {showSuggest ? "Suggestions" : `Preview — ${selected.label}`}
            </p>
            <div className="flex items-center gap-2">
              {loading && !showSuggest && <span className="text-[11px] text-slate-400">rendering…</span>}
              <button onClick={() => showSuggest ? setShowSuggest(false) : openSuggestions()}
                disabled={!sourceId || !sql.trim()}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-40 ${
                  showSuggest ? "border-blue-400 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                </svg>
                {showSuggest ? "Back to preview" : "Suggestions"}
              </button>
            </div>
          </div>
          {showSuggest ? (
            <SuggestionsPanel suggestions={suggestions} loading={suggestLoading}
              currentType={chartType} onPick={applySuggestion} onRefresh={fetchSuggestions} />
          ) : (
          <div className="flex-1 p-2 relative">
            {columns.length > 0 && missingFields.length > 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 p-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(37,99,235,0.07)" }}>
                  <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"/>
                  </svg>
                </div>
                <p className="text-slate-600 text-sm font-medium">Almost there — map the remaining fields</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {missingFields.map((f) => (
                    <span key={f} className="text-[11px] font-medium text-blue-700 px-2 py-1 rounded-lg border border-blue-200"
                      style={{ background: "rgba(37,99,235,0.05)" }}>
                      {f}
                    </span>
                  ))}
                </div>
                <p className="text-slate-400 text-xs max-w-60">Pick the columns in the Fields panel on the left</p>
              </div>
            ) : error ? (
              <div className="m-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
            ) : !figure ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 text-sm gap-2">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                Run a query, then map fields
              </div>
            ) : (
              <PlotlyChart figure={figure} className="w-full h-full min-h-[500px]" />
            )}
          </div>
          )}
        </div>

        {/* ── Right: panel options (Grafana-style) ── */}
        <OptionsPanel
          options={options}
          setOpt={setOpt}
          chartType={chartType}
          seriesNames={seriesNames}
        />
      </div>
    </div>
  )
}

// ── Suggestions panel (Grafana-style visualization suggestions) ──
function SuggestionsPanel({ suggestions, loading, currentType, onPick, onRefresh }: {
  suggestions: Suggestion[] | null
  loading: boolean
  currentType: string
  onPick: (s: Suggestion) => void
  onRefresh: () => void
}) {
  if (loading || suggestions === null) {
    return (
      <div className="flex-1 grid sm:grid-cols-2 gap-3 p-4 content-start">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 bg-slate-50 rounded-xl animate-pulse" />)}
      </div>
    )
  }
  if (suggestions.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Run a query to get suggestions.</div>
  }
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-slate-400">Pick a visualization that fits your data — click to apply it.</p>
        <button onClick={onRefresh} className="text-[11px] font-semibold text-blue-600 hover:underline">Refresh</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => onPick(s)}
            className={`text-left rounded-xl border overflow-hidden hover:shadow-md transition-all ${
              s.chart_type === currentType ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-blue-300"
            }`}>
            <div className="h-36 border-b border-slate-50 pointer-events-none">
              <PlotlyChart figure={{ ...s.figure, layout: { ...s.figure.layout, margin: { l: 28, r: 10, t: 10, b: 24 }, showlegend: false } }} />
            </div>
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-slate-800">{s.label}</p>
              <p className="text-[11px] text-slate-400">{s.reason}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Panel options inspector ─────────────────────────────────────
type Opts = Record<string, unknown>

function OptionsPanel({ options, setOpt, chartType, seriesNames }: {
  options: Opts
  setOpt: (patch: Opts) => void
  chartType: string
  seriesNames: string[]
}) {
  const cartesian = new Set([
    "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100", "lollipop",
    "line", "line_smooth", "line_step", "area", "area_stacked",
    "scatter", "bubble", "histogram", "boxplot", "violin", "waterfall", "candlestick",
    "density_heatmap",
  ]).has(chartType)
  const lineLike = new Set(["line", "line_smooth", "line_step", "area", "area_stacked", "scatter", "bubble"]).has(chartType)
  const sortable = new Set([
    "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100", "lollipop",
    "pie", "donut", "funnel", "radar", "polar_bar",
  ]).has(chartType)
  const continuous = CONTINUOUS_TYPES.has(chartType)
  const isKpi = new Set(["metric", "gauge", "bullet"]).has(chartType)
  const isTileMap = new Set(["map_scatter", "map_density"]).has(chartType)

  const get = <T,>(k: string, d: T): T => (options[k] as T) ?? d
  const inp = "w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-400 bg-white"
  const num = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : Number(v))

  const legendValues = get<string[]>("legendValues", [])
  const thresholds = get<{ value: number; color: string }[]>("thresholds", [])
  const annotations = get<{ x: string; text: string }[]>("annotations", [])
  const fieldColors = get<Record<string, string>>("fieldColors", {})

  return (
    <div className="space-y-3">
      <Group title="Panel" defaultOpen>
        <Field label="Title">
          <input className={inp} value={get("title", "")} onChange={(e) => setOpt({ title: e.target.value })} placeholder="Optional panel title" />
        </Field>
        <Field label="Description">
          <input className={inp} value={get("description", "")} onChange={(e) => setOpt({ description: e.target.value })} placeholder="Shown under the title" />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" className="w-3.5 h-3.5 rounded accent-blue-600"
            checked={get("transparent", true)} onChange={(e) => setOpt({ transparent: e.target.checked })} />
          Transparent background
        </label>
        {chartType === "bullet" && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="Target">
              <input type="number" className={inp} value={get("target", "")} onChange={(e) => setOpt({ target: num(e.target.value) })} />
            </Field>
            <Field label="Max">
              <input type="number" className={inp} value={get("max", "")} onChange={(e) => setOpt({ max: num(e.target.value) })} />
            </Field>
          </div>
        )}
      </Group>

      {isTileMap && (
        <Group title="Basemap" defaultOpen>
          <Field label="Map style">
            <select className={inp} value={get("mapStyle", "")} onChange={(e) => setOpt({ mapStyle: e.target.value || undefined })}>
              <option value="">Auto (follows theme)</option>
              {MAP_STYLES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </Field>
          <Field label="Zoom">
            <input type="number" min={0} max={18} step={0.5} className={inp}
              value={get("mapZoom", "")} onChange={(e) => setOpt({ mapZoom: num(e.target.value) })}
              placeholder="auto-fit to data" />
          </Field>
          {chartType === "map_density" && (
            <Field label="Heat radius">
              <input type="number" min={1} max={80} className={inp}
                value={get("radius", "")} onChange={(e) => setOpt({ radius: num(e.target.value) })} placeholder="22" />
            </Field>
          )}
          <p className="text-[10px] text-slate-400">Streets, Light, Dark &amp; Terrain need no API key. Satellite falls back to Streets unless a Mapbox token is configured.</p>
        </Group>
      )}

      <Group title="Colors" defaultOpen>
        <Field label="Palette">
          <select className={inp} value={get("palette", "")} onChange={(e) => setOpt({ palette: e.target.value || undefined })}>
            <option value="">Dashboard default</option>
            {PALETTE_NAMES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {PALETTE_NAMES.map((p) => (
            <button key={p} title={p} onClick={() => setOpt({ palette: p })}
              className={`px-1.5 py-1 rounded-md border ${get("palette", "") === p ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"}`}>
              <PaletteSwatch name={p} />
            </button>
          ))}
        </div>
        {continuous && (
          <>
            <Field label="Color scale">
              <select className={inp} value={get("colorScale", "")} onChange={(e) => setOpt({ colorScale: e.target.value || undefined })}>
                <option value="">Auto (from palette)</option>
                {COLOR_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded accent-blue-600"
                checked={get("reverseScale", false)} onChange={(e) => setOpt({ reverseScale: e.target.checked })} />
              Reverse scale
            </label>
          </>
        )}
      </Group>

      <Group title="Value format">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Decimals">
            <input type="number" min={0} max={6} className={inp} value={get("valueDecimals", "")} onChange={(e) => setOpt({ valueDecimals: num(e.target.value) })} placeholder="auto" />
          </Field>
          <label className="flex items-end gap-2 text-xs text-slate-600 cursor-pointer pb-1.5">
            <input type="checkbox" className="w-3.5 h-3.5 rounded accent-blue-600"
              checked={get("valueThousands", false)} onChange={(e) => setOpt({ valueThousands: e.target.checked })} />
            1,000s
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prefix">
            <input className={inp} value={get("valuePrefix", "")} onChange={(e) => setOpt({ valuePrefix: e.target.value })} placeholder="$" />
          </Field>
          <Field label="Suffix">
            <input className={inp} value={get("valueSuffix", "")} onChange={(e) => setOpt({ valueSuffix: e.target.value })} placeholder="%" />
          </Field>
        </div>
        {!isKpi && (
          <Field label="Data labels">
            <Segmented value={get("dataLabels", "off")} options={["off", "on"]}
              onChange={(v) => setOpt({ dataLabels: v })} />
          </Field>
        )}
        {!isKpi && get<string>("dataLabels", "off") === "on" && cartesian && (
          <Field label="Label position">
            <Segmented value={get("dataLabelPos", "auto")} options={["auto", "outside", "inside"]}
              onChange={(v) => setOpt({ dataLabelPos: v })} />
          </Field>
        )}
      </Group>

      {(cartesian || sortable) && (
        <Group title="Display">
          {sortable && (
            <Field label="Sort by value">
              <Segmented value={get("sort", "none")} options={["none", "asc", "desc"]}
                onChange={(v) => setOpt({ sort: v })} />
            </Field>
          )}
          {lineLike && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Line width">
                  <input type="number" min={0} step={0.5} className={inp} value={get("lineWidth", "")} onChange={(e) => setOpt({ lineWidth: num(e.target.value) })} placeholder="2" />
                </Field>
                <Field label="Marker size">
                  <input type="number" min={0} className={inp} value={get("markerSize", "")} onChange={(e) => setOpt({ markerSize: num(e.target.value) })} placeholder="6" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded accent-blue-600"
                  checked={get("showMarkers", true)} onChange={(e) => setOpt({ showMarkers: e.target.checked })} />
                Show markers
              </label>
            </>
          )}
          <Field label="Fill opacity">
            <input type="range" min={0} max={1} step={0.05} className="w-full accent-blue-600"
              value={get("fillOpacity", lineLike ? 0.5 : 1)} onChange={(e) => setOpt({ fillOpacity: Number(e.target.value) })} />
          </Field>
          {cartesian && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded accent-blue-600"
                checked={get("gridLines", true)} onChange={(e) => setOpt({ gridLines: e.target.checked })} />
              Grid lines
            </label>
          )}
        </Group>
      )}

      <Group title="Legend">
        <Field label="Mode">
          <Segmented value={get("legendMode", "list")} options={["list", "table", "hidden"]}
            onChange={(v) => setOpt({ legendMode: v })} />
        </Field>
        <Field label="Placement">
          <Segmented value={get("legendPlacement", "bottom")} options={["bottom", "right"]}
            onChange={(v) => setOpt({ legendPlacement: v })} />
        </Field>
        <Field label="Values">
          <div className="flex flex-wrap gap-1">
            {["min", "max", "mean", "last", "sum"].map((v) => {
              const on = legendValues.includes(v)
              return (
                <button key={v} onClick={() => setOpt({ legendValues: on ? legendValues.filter((x) => x !== v) : [...legendValues, v] })}
                  className={`px-1.5 py-1 rounded-md text-[10px] font-medium capitalize border ${on ? "border-blue-400 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500"}`}>
                  {v}
                </button>
              )
            })}
          </div>
        </Field>
      </Group>

      <Group title="Tooltip">
        <Field label="Mode">
          <Segmented value={get("tooltipMode", "single")} options={["single", "all", "hidden"]}
            onChange={(v) => setOpt({ tooltipMode: v })} />
        </Field>
        <Field label="Sort order">
          <Segmented value={get("tooltipSort", "none")} options={["none", "asc", "desc"]}
            onChange={(v) => setOpt({ tooltipSort: v })} />
        </Field>
      </Group>

      {cartesian && (
        <Group title="Axes">
          <Field label="X axis label">
            <input className={inp} value={get("xLabel", "")} onChange={(e) => setOpt({ xLabel: e.target.value })} />
          </Field>
          <Field label="Y axis label">
            <input className={inp} value={get("yLabel", "")} onChange={(e) => setOpt({ yLabel: e.target.value })} />
          </Field>
          <Field label="Scale">
            <Segmented value={get("yScale", "linear")} options={["linear", "log", "symlog"]}
              onChange={(v) => setOpt({ yScale: v })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Y min">
              <input type="number" className={inp} value={get("yMin", "")} onChange={(e) => setOpt({ yMin: num(e.target.value) })} />
            </Field>
            <Field label="Y max">
              <input type="number" className={inp} value={get("yMax", "")} onChange={(e) => setOpt({ yMax: num(e.target.value) })} />
            </Field>
          </div>
          <Field label="Y placement">
            <Segmented value={get("yPlacement", "left")} options={["left", "right", "hidden"]}
              onChange={(v) => setOpt({ yPlacement: v })} />
          </Field>
        </Group>
      )}

      {cartesian && (
        <Group title="Thresholds">
          <Field label="Display">
            <Segmented value={get("thresholdDisplay", "lines")} options={["lines", "filled", "off"]}
              onChange={(v) => setOpt({ thresholdDisplay: v })} />
          </Field>
          {thresholds.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input type="number" className={inp} value={t.value}
                onChange={(e) => setOpt({ thresholds: thresholds.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x) })} />
              <input type="color" value={t.color} className="w-7 h-7 rounded border border-slate-200 shrink-0"
                onChange={(e) => setOpt({ thresholds: thresholds.map((x, j) => j === i ? { ...x, color: e.target.value } : x) })} />
              <button onClick={() => setOpt({ thresholds: thresholds.filter((_, j) => j !== i) })}
                className="text-slate-300 hover:text-red-500 px-1 text-sm shrink-0">✕</button>
            </div>
          ))}
          <button onClick={() => setOpt({ thresholds: [...thresholds, { value: 0, color: "#ef4444" }] })}
            className="text-[11px] font-semibold text-blue-600 hover:underline">+ Add threshold</button>
        </Group>
      )}

      {cartesian && (
        <Group title="Annotations">
          {annotations.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={inp} placeholder="x value" value={a.x}
                onChange={(e) => setOpt({ annotations: annotations.map((x, j) => j === i ? { ...x, x: e.target.value } : x) })} />
              <input className={inp} placeholder="label" value={a.text}
                onChange={(e) => setOpt({ annotations: annotations.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
              <button onClick={() => setOpt({ annotations: annotations.filter((_, j) => j !== i) })}
                className="text-slate-300 hover:text-red-500 px-1 text-sm shrink-0">✕</button>
            </div>
          ))}
          <button onClick={() => setOpt({ annotations: [...annotations, { x: "", text: "" }] })}
            className="text-[11px] font-semibold text-blue-600 hover:underline">+ Add annotation</button>
        </Group>
      )}

      {seriesNames.length > 0 && (
        <Group title="Field overrides">
          <p className="text-[10px] text-slate-400 -mt-1">Override the colour of a series.</p>
          {seriesNames.map((nm) => (
            <div key={nm} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-600 flex-1 truncate">{nm}</span>
              <input type="color" value={fieldColors[nm] ?? "#2563eb"} className="w-7 h-7 rounded border border-slate-200 shrink-0"
                onChange={(e) => setOpt({ fieldColors: { ...fieldColors, [nm]: e.target.value } })} />
              {fieldColors[nm] && (
                <button onClick={() => { const f = { ...fieldColors }; delete f[nm]; setOpt({ fieldColors: f }) }}
                  className="text-slate-300 hover:text-red-500 px-1 text-sm shrink-0">✕</button>
              )}
            </div>
          ))}
        </Group>
      )}
    </div>
  )
}

// Palette preview swatches — first 4 colours of each named palette (mirror backend)
const PALETTE_HEX: Record<string, string[]> = {
  default: ["#2563eb", "#06b6d4", "#7c3aed", "#059669"],
  ocean: ["#0ea5e9", "#0891b2", "#2563eb", "#06b6d4"],
  sunset: ["#f97316", "#ef4444", "#f59e0b", "#ec4899"],
  forest: ["#059669", "#65a30d", "#16a34a", "#0d9488"],
  berry: ["#7c3aed", "#db2777", "#8b5cf6", "#ec4899"],
  slate: ["#475569", "#0ea5e9", "#64748b", "#38bdf8"],
  vibrant: ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899"],
}

function PaletteSwatch({ name }: { name: string }) {
  return (
    <span className="flex rounded-sm overflow-hidden">
      {(PALETTE_HEX[name] ?? PALETTE_HEX.default).map((c, i) => (
        <span key={i} className="w-2 h-3.5" style={{ background: c }} />
      ))}
    </span>
  )
}

function Group({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-slate-100">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && <div className="px-4 pb-4 space-y-2.5">{children}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`flex-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${
            value === o ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
          }`}>
          {o}
        </button>
      ))}
    </div>
  )
}

// ── Multi-column select (for y / path) ─────────────────────────
function MultiColumnSelect({ columns, value, onChange }: {
  columns: string[]; value: string[]; onChange: (v: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {columns.map((c) => {
        const active = value.includes(c)
        return (
          <button key={c}
            onClick={() => onChange(active ? value.filter((v) => v !== c) : [...value, c])}
            className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
              active ? "border-blue-400 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
            style={active ? { background: "rgba(37,99,235,0.06)" } : {}}>
            {c}
          </button>
        )
      })}
      {columns.length === 0 && <p className="text-[11px] text-slate-300">run a query first</p>}
    </div>
  )
}
