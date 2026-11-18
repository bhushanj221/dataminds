// Chart type catalog — encodings drive the builder's field-mapping UI.
// key matches the backend builder; field keys match config keys.

export interface ChartField {
  key: string          // config key sent to backend
  label: string
  required?: boolean
  multi?: boolean      // multi-column select (y, path)
  numeric?: boolean    // hint: usually a numeric column
}

export interface ChartType {
  id: string
  label: string
  group: string
  icon: string         // tiny emoji/visual hint for the picker
  fields: ChartField[]
  hint?: string
}

const x = (label = "X axis"): ChartField => ({ key: "x", label, required: true })
const y = (label = "Y axis (values)", multi = true): ChartField => ({ key: "y", label, required: true, multi, numeric: true })
const series = (): ChartField => ({ key: "series", label: "Color / series (optional)" })
const value = (label = "Value", required = true): ChartField => ({ key: "value", label, required, numeric: true })

export const CHART_TYPES: ChartType[] = [
  // ── Comparison ──
  { id: "bar", label: "Bar", group: "Comparison", icon: "▮▮▮", fields: [x("Category"), y(), series()] },
  { id: "bar_horizontal", label: "Horizontal Bar", group: "Comparison", icon: "▬▬", fields: [x("Category"), y(), series()] },
  { id: "bar_grouped", label: "Grouped Bar", group: "Comparison", icon: "▮▮ ▮▮", fields: [x("Category"), y(), series()] },
  { id: "bar_stacked", label: "Stacked Bar", group: "Comparison", icon: "▤", fields: [x("Category"), y(), series()] },
  { id: "bar_stacked_100", label: "100% Stacked Bar", group: "Comparison", icon: "▥", fields: [x("Category"), y(), series()] },
  { id: "lollipop", label: "Lollipop", group: "Comparison", icon: "┃●", fields: [x("Category"), y(), series()],
    hint: "Cleaner than bars for ranked comparisons — try Sort in Display" },

  // ── Trend ──
  { id: "line", label: "Line", group: "Trend", icon: "╱╲", fields: [x("X axis (time)"), y(), series()] },
  { id: "line_smooth", label: "Smooth Line", group: "Trend", icon: "∿", fields: [x("X axis (time)"), y(), series()] },
  { id: "line_step", label: "Step Line", group: "Trend", icon: "⌐∟", fields: [x("X axis (time)"), y(), series()] },
  { id: "area", label: "Area", group: "Trend", icon: "◢", fields: [x("X axis (time)"), y(), series()] },
  { id: "area_stacked", label: "Stacked Area", group: "Trend", icon: "≋", fields: [x("X axis (time)"), y(), series()] },

  // ── Part-to-Whole ──
  { id: "pie", label: "Pie", group: "Part-to-Whole", icon: "◕", fields: [x("Labels"), { key: "y", label: "Values", required: true, numeric: true }] },
  { id: "donut", label: "Donut", group: "Part-to-Whole", icon: "◍", fields: [x("Labels"), { key: "y", label: "Values", required: true, numeric: true }] },
  { id: "sunburst", label: "Sunburst", group: "Part-to-Whole", icon: "❂",
    fields: [{ key: "path", label: "Hierarchy levels (outer→inner)", required: true, multi: true }, { key: "y", label: "Values", required: true, numeric: true }] },
  { id: "treemap", label: "Treemap", group: "Part-to-Whole", icon: "▦",
    fields: [{ key: "path", label: "Hierarchy levels", required: true, multi: true }, { key: "y", label: "Values", required: true, numeric: true }] },
  { id: "funnel", label: "Funnel", group: "Part-to-Whole", icon: "▽", fields: [x("Stage"), { key: "y", label: "Values", required: true, numeric: true }] },

  // ── Distribution ──
  { id: "histogram", label: "Histogram", group: "Distribution", icon: "▂▅▇▅▂", fields: [x("Values"), series()] },
  { id: "boxplot", label: "Box Plot", group: "Distribution", icon: "⊟", fields: [{ key: "y", label: "Values", required: true, numeric: true }, { key: "series", label: "Group by (optional)" }] },
  { id: "violin", label: "Violin", group: "Distribution", icon: "🎻", fields: [{ key: "y", label: "Values", required: true, numeric: true }, { key: "series", label: "Group by (optional)" }] },
  { id: "heatmap", label: "Heatmap", group: "Distribution", icon: "▩",
    fields: [x("X axis"), { key: "y", label: "Y axis", required: true }, value()] },
  { id: "density_heatmap", label: "Density Heatmap", group: "Distribution", icon: "⣿",
    fields: [x("X axis"), { key: "y", label: "Y axis", required: true, numeric: true }],
    hint: "2-D point density — both axes numeric. Recolour via Colors → Scale" },

  // ── Relationship ──
  { id: "scatter", label: "Scatter", group: "Relationship", icon: "∴", fields: [x(), { key: "y", label: "Y axis", required: true, numeric: true }, series()] },
  { id: "bubble", label: "Bubble", group: "Relationship", icon: "◦○●",
    fields: [x(), { key: "y", label: "Y axis", required: true, numeric: true }, { key: "size", label: "Bubble size", required: true, numeric: true }, series()] },
  { id: "candlestick", label: "Candlestick", group: "Relationship", icon: "🕯",
    fields: [x("Date"), { key: "open", label: "Open", required: true, numeric: true }, { key: "high", label: "High", required: true, numeric: true },
             { key: "low", label: "Low", required: true, numeric: true }, { key: "close", label: "Close", required: true, numeric: true }] },
  { id: "waterfall", label: "Waterfall", group: "Relationship", icon: "⊥⊤", fields: [x("Step"), { key: "y", label: "Change", required: true, numeric: true }] },
  { id: "sankey", label: "Sankey", group: "Relationship", icon: "⇶",
    fields: [{ key: "source", label: "Source", required: true }, { key: "target", label: "Target", required: true }, value("Flow value")] },
  { id: "radar", label: "Radar", group: "Relationship", icon: "✪", fields: [x("Axes (categories)"), y("Values")] },
  { id: "polar_bar", label: "Polar Bar", group: "Relationship", icon: "✸",
    fields: [x("Axes (categories)"), { key: "y", label: "Values", required: true, numeric: true }, series()] },
  { id: "parallel", label: "Parallel Coords", group: "Relationship", icon: "▥▤",
    fields: [{ key: "y", label: "Dimensions (numeric)", required: true, multi: true, numeric: true },
             { key: "series", label: "Color by (numeric, optional)", numeric: true }],
    hint: "Compare many measures at once across rows" },
  { id: "scatter_3d", label: "3D Scatter", group: "Relationship", icon: "⬡",
    fields: [x("X axis"), { key: "y", label: "Y axis", required: true, numeric: true },
             { key: "z", label: "Z axis", required: true, numeric: true },
             { key: "size", label: "Bubble size (optional)", numeric: true }, series()] },
  { id: "surface_3d", label: "3D Surface", group: "Relationship", icon: "⛰",
    fields: [x("X axis"), { key: "y", label: "Y axis", required: true },
             value("Z value")],
    hint: "Z-surface over an X×Y grid (like a heatmap in 3-D)" },

  // ── Geo Maps ──
  { id: "choropleth", label: "Choropleth Map", group: "Geo Maps", icon: "🗺",
    fields: [{ key: "location", label: "Country column", required: true }, value("Color value")],
    hint: "Country names (United States, India, …) or set ISO-3 codes" },
  { id: "geo_scatter", label: "Geo Bubble Map", group: "Geo Maps", icon: "📍",
    fields: [{ key: "lat", label: "Latitude", required: true, numeric: true }, { key: "lon", label: "Longitude", required: true, numeric: true },
             { key: "size", label: "Bubble size (optional)", numeric: true }, { key: "x", label: "Hover label (optional)" }] },
  { id: "map_scatter", label: "Tile Bubble Map", group: "Geo Maps", icon: "🗺📍",
    fields: [{ key: "lat", label: "Latitude", required: true, numeric: true }, { key: "lon", label: "Longitude", required: true, numeric: true },
             { key: "size", label: "Bubble size (optional)", numeric: true }, { key: "series", label: "Color by (optional)" },
             { key: "x", label: "Hover label (optional)" }],
    hint: "Points on a real street/satellite map — set the basemap in the Basemap panel. Pan & zoom enabled." },
  { id: "map_density", label: "Tile Heatmap", group: "Geo Maps", icon: "🗺♨",
    fields: [{ key: "lat", label: "Latitude", required: true, numeric: true }, { key: "lon", label: "Longitude", required: true, numeric: true },
             { key: "value", label: "Weight (optional)", numeric: true }],
    hint: "Geographic density heatmap over a real basemap" },

  // ── KPI ──
  { id: "metric", label: "KPI Number", group: "KPI", icon: "42", fields: [value("Value column")],
    hint: "Shows the first row's value — aggregate in SQL (e.g. SELECT SUM(amount))" },
  { id: "gauge", label: "Gauge", group: "KPI", icon: "◔", fields: [value("Value column")],
    hint: "First row's value on a dial" },
  { id: "bullet", label: "Bullet (vs target)", group: "KPI", icon: "▶│", fields: [value("Value column")],
    hint: "Value against a target — set Target & Max in Panel options" },
  { id: "table", label: "Table", group: "KPI", icon: "▦", fields: [], hint: "Shows all result columns" },
]

export const CHART_GROUPS = [...new Set(CHART_TYPES.map((c) => c.group))]
