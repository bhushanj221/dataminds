"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"

/* ════════════════════════════════════════════════════════════════
   DataMind — User Manual / Documentation
   A single-page, self-contained guide. Left sticky TOC with active-
   section highlighting (IntersectionObserver); right scrollable body.
   Public page — matches the marketing design language.
   ═══════════════════════════════════════════════════════════════ */

interface Sec { id: string; title: string }
interface Group { label: string; items: Sec[] }

const NAV: Group[] = [
  {
    label: "Getting started",
    items: [
      { id: "overview", title: "What is DataMind" },
      { id: "quickstart", title: "Quick start (5 min)" },
      { id: "concepts", title: "Core concepts" },
    ],
  },
  {
    label: "Connect & explore",
    items: [
      { id: "sources", title: "Data sources" },
      { id: "sql", title: "SQL editor" },
      { id: "semantic", title: "Semantic layer" },
    ],
  },
  {
    label: "Ask AI",
    items: [
      { id: "ai-chat", title: "AI chat (text-to-SQL)" },
      { id: "ai-dashboard", title: "AI dashboard builder" },
      { id: "ai-usage", title: "Usage, quota & cost" },
    ],
  },
  {
    label: "Visualize",
    items: [
      { id: "charts", title: "Charts & chart types" },
      { id: "panel-options", title: "Panel & color options" },
      { id: "dashboards", title: "Dashboards" },
      { id: "filters", title: "Filters" },
      { id: "variables", title: "Query variables" },
      { id: "theming", title: "Themes, palettes & refresh" },
    ],
  },
  {
    label: "Operate",
    items: [
      { id: "monitoring", title: "KPI monitoring & alerts" },
      { id: "reports", title: "Reports" },
      { id: "roles", title: "Workspace & roles" },
      { id: "performance", title: "Performance & caching" },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "faq", title: "FAQ & troubleshooting" },
      { id: "shortcuts", title: "Tips & shortcuts" },
    ],
  },
]

const ALL_IDS = NAV.flatMap((g) => g.items.map((i) => i.id))

export default function DocsPage() {
  const [active, setActive] = useState<string>("overview")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id)
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    )
    ALL_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-700">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200/80">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/30">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-slate-900 font-bold text-lg tracking-tight">DataMind</span>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold uppercase tracking-widest">Docs</span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen((v) => !v)}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <Link href="/dashboard" className="px-4 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-cyan-500 transition-all">
              Open app →
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 flex gap-10">
        {/* ── Sidebar TOC ── */}
        <aside className={`${open ? "block" : "hidden"} lg:block fixed lg:sticky inset-x-0 lg:inset-x-auto top-14 lg:top-14 z-30 lg:z-auto bg-white lg:bg-transparent border-b lg:border-0 border-slate-200 lg:w-64 shrink-0 lg:self-start lg:h-[calc(100vh-3.5rem)] overflow-y-auto py-8 px-4 lg:px-0`}>
          <nav className="space-y-6">
            {NAV.map((g) => (
              <div key={g.label}>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-3">{g.label}</p>
                <ul className="space-y-0.5">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <a href={`#${it.id}`} onClick={() => setOpen(false)}
                        className={`block px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          active === it.id
                            ? "bg-blue-50 text-blue-700 font-semibold"
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        }`}>
                        {it.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Content ── */}
        <main className="flex-1 min-w-0 py-12 max-w-3xl">
          <DocBody />
          <footer className="mt-20 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-400">
            <span>© 2026 DataMind — User manual</span>
            <Link href="/" className="hover:text-slate-700">← Back to home</Link>
          </footer>
        </main>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Presentational helpers
   ──────────────────────────────────────────────────────────────── */
function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">{children}</h1>
}
function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-16">
      <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600 mb-1">{eyebrow}</p>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">{title}</h2>
      <div className="space-y-4 leading-relaxed text-[15px]">{children}</div>
    </section>
  )
}
function P({ children }: { children: ReactNode }) {
  return <p className="text-slate-600">{children}</p>
}
function Sub({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-bold text-slate-800 mt-6 mb-2">{children}</h3>
}
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3 my-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <span className="text-slate-600 pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  )
}
function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 my-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-slate-600">
          <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}
function Code({ children }: { children: ReactNode }) {
  return <code className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[13px] font-mono text-blue-700">{children}</code>
}
function Block({ children }: { children: string }) {
  return (
    <pre className="my-4 rounded-xl bg-slate-900 text-slate-100 text-[13px] font-mono p-4 overflow-x-auto leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}
function Note({ kind = "tip", children }: { kind?: "tip" | "warn" | "info"; children: ReactNode }) {
  const map = {
    tip: { bd: "border-emerald-200", bg: "bg-emerald-50", dot: "text-emerald-600", label: "Tip" },
    warn: { bd: "border-amber-200", bg: "bg-amber-50", dot: "text-amber-600", label: "Heads up" },
    info: { bd: "border-blue-200", bg: "bg-blue-50", dot: "text-blue-600", label: "Note" },
  }[kind]
  return (
    <div className={`my-4 rounded-xl border ${map.bd} ${map.bg} p-4`}>
      <p className={`text-[11px] font-bold uppercase tracking-widest ${map.dot} mb-1`}>{map.label}</p>
      <div className="text-slate-600 text-sm">{children}</div>
    </div>
  )
}
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>{head.map((h) => <th key={h} className="text-left font-semibold text-slate-700 px-4 py-2.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              {r.map((c, j) => <td key={j} className="px-4 py-2.5 text-slate-600 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   The manual content
   ──────────────────────────────────────────────────────────────── */
function DocBody() {
  return (
    <>
      <div className="mb-14">
        <H1>DataMind user manual</H1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Everything you need to connect data, ask questions in plain English, build dashboards,
          and monitor your KPIs. This guide walks through each part of the product in the order
          you&apos;ll actually use it.
        </p>
      </div>

      {/* ───── Overview ───── */}
      <Section id="overview" eyebrow="Getting started" title="What is DataMind">
        <P>
          DataMind is an AI-native business-intelligence platform. Connect any SQL database, then
          explore it three ways: write SQL by hand, ask questions in natural language (the AI writes
          and runs the SQL for you), or drag saved charts onto interactive dashboards. On top of that
          you get KPI alerts, scheduled reports, a semantic layer that teaches the AI your business
          terms, and a result cache that keeps everything fast.
        </P>
        <Sub>Who it&apos;s for</Sub>
        <Bullets items={[
          <><b>Analysts</b> — build charts and dashboards, run SQL, ask the AI.</>,
          <><b>Data engineers</b> — connect sources, curate the semantic layer.</>,
          <><b>Viewers</b> — open shared dashboards, filter, and export, without editing.</>,
        ]} />
      </Section>

      {/* ───── Quick start ───── */}
      <Section id="quickstart" eyebrow="Getting started" title="Quick start (5 minutes)">
        <P>From a fresh account to your first dashboard:</P>
        <Steps items={[
          <>Sign in and open the app. You land on the <b>Dashboard</b> home.</>,
          <>Go to <b>Sources</b> → <b>Add source</b>, enter your database connection, and test it.</>,
          <>Open <b>AI Chat</b>, pick the source, and ask something like <i>&ldquo;total sales by region this year&rdquo;</i>. The AI writes SQL, runs it, and charts the answer.</>,
          <>Click <b>Save to dashboard</b> on the result — or open <b>Charts</b> to build one by hand with full control.</>,
          <>Open <b>Dashboards</b>, arrange your charts on the grid, add a filter or two, and share.</>,
        ]} />
        <Note kind="tip">
          No data handy? Ask the AI <Code>show me the tables I have</Code> and it will explore the schema with you.
        </Note>
      </Section>

      {/* ───── Concepts ───── */}
      <Section id="concepts" eyebrow="Getting started" title="Core concepts">
        <Table
          head={["Concept", "What it is"]}
          rows={[
            [<b>Source</b>, "A connected database. Everything you query lives behind a source."],
            [<b>Chart</b>, "A saved query + a chart type + display options. Reusable across dashboards."],
            [<b>Dashboard</b>, "A grid of charts with shared filters, variables, theme, and auto-refresh."],
            [<b>Semantic layer</b>, "Business definitions (tables, metrics, synonyms) that make the AI accurate."],
            [<b>Workspace</b>, "Your team's shared space. Sources, charts, and dashboards are scoped to it."],
            [<b>Alert / KPI</b>, "A metric watched on a schedule that notifies you when it crosses a threshold."],
          ]}
        />
      </Section>

      {/* ───── Sources ───── */}
      <Section id="sources" eyebrow="Connect & explore" title="Data sources">
        <P>
          A source is a connection to your database. Add one under <b>Sources</b>. DataMind reads the
          schema so the SQL editor can autocomplete and the AI knows your tables.
        </P>
        <Steps items={[
          <>Click <b>Add source</b> and choose the database type.</>,
          <>Fill in host, port, database, user, and password. Credentials are stored encrypted.</>,
          <>Hit <b>Test connection</b> — you&apos;ll see latency if it succeeds.</>,
          <>Save. The schema is scanned and the source becomes selectable everywhere.</>,
        ]} />
        <Note kind="warn">
          DataMind runs <b>read-only</b> queries against your sources. Statements that would modify data
          are rejected before they ever reach the database — this guard also backstops AI-generated SQL.
        </Note>
      </Section>

      {/* ───── SQL editor ───── */}
      <Section id="sql" eyebrow="Connect & explore" title="SQL editor">
        <P>
          For full control, write SQL directly. The editor gives you syntax highlighting, schema-aware
          autocomplete, and a results grid.
        </P>
        <Bullets items={[
          <><b>Run</b> a query to see results in a sortable grid with row count and timing.</>,
          <><b>Pin to chart</b> sends the current query straight into the chart builder.</>,
          <><b>Export</b> results as CSV for offline use.</>,
        ]} />
        <Note kind="info">
          Anything you can express in SQL becomes a chart. The chart builder simply maps result columns
          onto a visual — see <a href="#charts" className="text-blue-600 font-medium">Charts</a>.
        </Note>
      </Section>

      {/* ───── Semantic layer ───── */}
      <Section id="semantic" eyebrow="Connect & explore" title="Semantic layer">
        <P>
          The semantic layer is how you teach the AI your business. It holds table and column
          descriptions, reusable metric definitions, and synonyms (&ldquo;revenue&rdquo; = &ldquo;net
          sales&rdquo;). The richer it is, the more accurate text-to-SQL becomes.
        </P>
        <Bullets items={[
          "Describe what each important table and column means.",
          "Define verified metrics once so the AI never invents the math.",
          "Add synonyms for the words your team actually uses.",
        ]} />
        <Note kind="tip">
          The semantic layer is <b>workspace-scoped</b> and is fed to the AI as a stable part of the prompt,
          so it also improves prompt-cache hit rates (cheaper, faster answers).
        </Note>
      </Section>

      {/* ───── AI chat ───── */}
      <Section id="ai-chat" eyebrow="Ask AI" title="AI chat (text-to-SQL)">
        <P>
          Ask a question in plain English; the AI classifies it, finds the relevant tables, writes SQL,
          runs it, and picks a chart. You can inspect and edit the SQL at any point.
        </P>
        <Sub>The flow</Sub>
        <Steps items={[
          <>Pick the data source and type your question.</>,
          <>The AI returns an answer with a chart and the generated SQL (expandable).</>,
          <>Not quite right? Edit the SQL and re-run, or ask a follow-up — context carries over.</>,
          <>Happy with it? <b>Save to dashboard</b> to keep the chart.</>,
        ]} />
        <Note kind="info">
          If a question is ambiguous, the AI asks one clarifying question rather than guessing. If a query
          errors, it self-corrects and retries automatically.
        </Note>
      </Section>

      {/* ───── AI dashboard builder ───── */}
      <Section id="ai-dashboard" eyebrow="Ask AI" title="AI dashboard builder">
        <P>
          Beyond single charts, the AI can build an <b>entire dashboard</b> from a topic. Give it a subject
          like <i>&ldquo;sales performance&rdquo;</i> and it proposes a set of questions, generates a chart for
          each, and assembles them into a ready dashboard.
        </P>
        <Steps items={[
          <>In AI Chat, click <b>Build dashboard</b>.</>,
          <>Enter a topic and how many panels you want.</>,
          <>The AI defines the questions, builds each chart, and opens the new dashboard for you to refine.</>,
        ]} />
        <Note kind="tip">This is additive — your single-chart workflow is unchanged. Treat the generated board as a starting point and edit freely.</Note>
      </Section>

      {/* ───── AI usage ───── */}
      <Section id="ai-usage" eyebrow="Ask AI" title="Usage, quota & cost">
        <P>
          Each AI answer consumes model tokens. The header shows your usage, e.g. <Code>17 q · 0 tok</Code>
          — questions asked this period and tokens billed. DataMind keeps cost low automatically:
        </P>
        <Bullets items={[
          <><b>Prompt caching</b> — the stable part of the prompt (rules + schema + semantic layer) is cached by the model provider, so repeat questions are billed at a discount.</>,
          <><b>Cached-token accounting</b> — the discount is tracked per request, so your reported cost reflects what you actually pay.</>,
          <><b>Per-workspace lanes</b> — caching is keyed per workspace, so tenants don&apos;t collide while still sharing a single API key.</>,
        ]} />
        <P>Admins can set a monthly AI budget per workspace under Settings.</P>
      </Section>

      {/* ───── Charts ───── */}
      <Section id="charts" eyebrow="Visualize" title="Charts & chart types">
        <P>
          The chart builder ( <b>Charts → New chart</b> ) has three panels: <b>Data &amp; fields</b> on the left,
          a live <b>preview</b> in the center, and <b>panel options</b> on the right. Write a query, run it,
          map columns to the chart&apos;s fields, and the preview updates instantly.
        </P>
        <Sub>39 chart types</Sub>
        <Table
          head={["Group", "Types"]}
          rows={[
            ["Comparison", "Bar, Horizontal bar, Grouped, Stacked, 100% stacked, Lollipop"],
            ["Trend", "Line, Smooth line, Step line, Area, Stacked area"],
            ["Part-to-whole", "Pie, Donut, Sunburst, Treemap, Funnel"],
            ["Distribution", "Histogram, Box plot, Violin, Heatmap, Density heatmap"],
            ["Relationship", "Scatter, Bubble, Candlestick, Waterfall, Sankey, Radar, Polar bar, Parallel coords, 3D scatter, 3D surface"],
            ["Geo / Maps", "Choropleth map, Geo bubble map, Tile bubble map, Tile heatmap"],
            ["KPI", "Big number, Gauge, Bullet (vs target), Table"],
          ]}
        />
        <Sub>Maps</Sub>
        <P>
          There are two kinds of map. <b>Geo bubble / Choropleth</b> render on a plain projected globe.
          The <b>Tile bubble map</b> and <b>Tile heatmap</b> render on a real, pan-and-zoom street/satellite
          basemap (OpenStreetMap, Carto Light/Dark, Terrain, or Satellite).
        </P>
        <Note kind="info">
          Map charts need a numeric <b>Latitude</b> and <b>Longitude</b> column. Standard names
          (lat/latitude, lon/lng/longitude) map automatically; a non-standard name (e.g. <Code>log</Code>)
          you map by hand. Choropleth instead needs a <b>country</b> column (names or ISO-3 codes) and a value.
          The builder shows this hint inline when you pick a map type.
        </Note>
        <Sub>Visualization suggestions</Sub>
        <P>
          Not sure which chart fits? Click <b>Suggestions</b> in the preview header. DataMind inspects your
          result shape and shows several ranked, pre-rendered candidates — click one to apply its field
          mapping instantly. A <b>Map points</b> suggestion appears automatically when your result has
          latitude/longitude columns. (Suggestions are computed locally from the data, with no extra AI call.)
        </P>
      </Section>

      {/* ───── Panel options ───── */}
      <Section id="panel-options" eyebrow="Visualize" title="Panel & color options">
        <P>The right-hand inspector tailors every detail of a chart. Options ride with the chart, so they apply identically in the builder and on dashboards.</P>
        <Table
          head={["Group", "What you can set"]}
          rows={[
            [<b>Panel</b>, "Title, description, transparent background; Target & Max for bullet charts"],
            [<b>Colors</b>, "Per-chart palette override (with swatch preview), continuous color scale, reverse scale"],
            [<><b>Basemap</b> (maps)</>, "Map style (Streets / Light / Dark / Terrain / Satellite), zoom, heat radius"],
            [<b>Value format</b>, "Decimals, thousands separator, prefix/suffix, data labels & position"],
            [<b>Legend</b>, "Mode (list/table/hidden), placement, summary values (min/max/mean/last/sum)"],
            [<b>Tooltip</b>, "Single / all-series / hidden, sort order"],
            [<b>Axes</b>, "X/Y labels, linear/log scale, min/max, axis placement"],
            [<b>Display</b>, "Sort by value, line width, marker size, fill opacity, grid lines"],
            [<b>Thresholds</b>, "Reference lines or filled bands at chosen values & colors"],
            [<b>Annotations</b>, "Vertical markers with labels at specific x-values"],
            [<b>Field overrides</b>, "Force a specific color for an individual series"],
          ]}
        />
        <Note kind="tip">
          The <b>Colors → Palette</b> override recolors just one chart without touching the rest of the
          dashboard. Leave it on <i>Dashboard default</i> to inherit the board&apos;s palette.
        </Note>
      </Section>

      {/* ───── Dashboards ───── */}
      <Section id="dashboards" eyebrow="Visualize" title="Dashboards">
        <P>
          A dashboard is a responsive grid of charts. Drag to move, drag the corner to resize, and the
          layout is saved automatically. Every chart on the board shares the board&apos;s filters, variables,
          theme, palette, and refresh interval.
        </P>
        <Bullets items={[
          <><b>Expand</b> a single chart to true full screen (with scroll-zoom on maps); close with ✕.</>,
          <><b>Export CSV</b> for an individual panel&apos;s data.</>,
          <><b>Present mode</b> takes the whole board into browser fullscreen for a clean, TV-friendly view.</>,
          <><b>Refresh now</b> re-runs every panel with fresh data; the icon spins until done.</>,
        ]} />
        <Sub>Organizing with folders</Sub>
        <P>
          Group dashboards into <b>folders</b> — and folders inside folders. The left sidebar on the
          Dashboards page is a folder tree: create a folder (or a subfolder via the <b>+</b> on any row),
          click a folder to filter the grid to it, and move a dashboard in via its <b>folder icon</b>.
          Deleting a folder keeps its dashboards and subfolders — they move up one level.
        </P>
        <Note kind="info">
          Editing (moving, resizing, changing filters) requires edit permission on the dashboard. Viewers
          can still filter and export their own view without changing the saved board.
        </Note>
      </Section>

      {/* ───── Filters ───── */}
      <Section id="filters" eyebrow="Visualize" title="Filters">
        <P>
          DataMind has two filter levels, both Power-BI style. Filters are applied in-memory to query
          results, so they&apos;re instant and work across any source.
        </P>
        <Bullets items={[
          <><b>Dashboard filters</b> apply to every panel that has the filtered column.</>,
          <><b>Per-chart filters</b> scope to a single panel.</>,
        ]} />
        <Sub>Operators</Sub>
        <P>Each filter adapts its controls to the column type. Supported operators:</P>
        <Block>{`in (multi-select)   ·   contains
equals / not equals
> , < , ≥ , ≤
between (two bounds)`}</Block>
        <P>
          Low-cardinality columns show a multi-select of their distinct values; numeric and date columns
          offer comparison and range inputs.
        </P>
      </Section>

      {/* ───── Variables ───── */}
      <Section id="variables" eyebrow="Visualize" title="Query variables">
        <P>
          Variables let viewers parameterize the SQL behind charts without editing it. Define a variable on
          the dashboard, reference it in a chart&apos;s SQL with double braces, and viewers get an input that
          substitutes a value at render time.
        </P>
        <Block>{`-- chart SQL
SELECT *
FROM orders
WHERE country = {{ country }}
  AND created_at >= {{ start_date }}`}</Block>
        <P>Define each variable with a name, type (number, date, select, or text), a default, and — for selects — a list of allowed options.</P>
        <Note kind="warn">
          <b>Injection-safe by design.</b> Variable values are never concatenated raw. Each value is validated
          against its type and rendered as a safe literal; only variables you defined are substituted, and the
          read-only guard runs after substitution. A value like <Code>{`'; DROP TABLE orders; --`}</Code> becomes a
          harmless string literal, not executable SQL.
        </Note>
      </Section>

      {/* ───── Theming ───── */}
      <Section id="theming" eyebrow="Visualize" title="Themes, palettes & refresh">
        <Sub>Color palettes</Sub>
        <P>
          Pick a board-wide palette — Default, Ocean, Sunset, Forest, Berry, Slate, or Vibrant — and every
          chart recolors to match. Each palette pairs with a continuous color scale used by heatmaps and maps.
          Individual charts can override the palette (see <a href="#panel-options" className="text-blue-600 font-medium">Panel options</a>).
        </P>
        <Sub>Light & dark</Sub>
        <P>
          Toggle the whole app between light and dark with the sun/moon button in the top bar; your choice is
          remembered. Dashboards also carry their own light/dark theme for charts.
        </P>
        <Sub>Auto-refresh</Sub>
        <P>
          Set a refresh interval (Off, 10s, 30s, 1m, 5m) so a live dashboard re-pulls on a timer. A pulsing dot
          indicates auto-refresh is on; the manual <b>refresh</b> button always fetches fresh data immediately.
        </P>
      </Section>

      {/* ───── Monitoring ───── */}
      <Section id="monitoring" eyebrow="Operate" title="KPI monitoring & alerts">
        <P>
          Watch a metric and get notified when it crosses a line. Define a KPI from a query, set a threshold
          and direction (higher- or lower-is-better), and choose how often to check.
        </P>
        <Steps items={[
          <>Open <b>Monitor</b> and create an alert from a metric query.</>,
          <>Set the threshold, comparison, and check frequency.</>,
          <>Pick a notification channel (e.g. in-app / email).</>,
          <>Review fired alerts and their values in the history.</>,
        ]} />
        <Note kind="info">
          Checks run on an in-process scheduler inside the backend on a fixed cadence — no extra services to
          run. (This is why the backend runs as a single instance in production.)
        </Note>
      </Section>

      {/* ───── Reports ───── */}
      <Section id="reports" eyebrow="Operate" title="Reports">
        <P>
          Reports turn a query or dashboard into something delivered on a schedule. Configure what to send,
          who receives it, and when, and DataMind generates and dispatches it automatically using the same
          background scheduler that powers alerts.
        </P>
        <Bullets items={[
          "Schedule recurring delivery (daily, weekly, monthly).",
          "Send to one or more recipients.",
          "Review delivery history.",
        ]} />
      </Section>

      {/* ───── Roles ───── */}
      <Section id="roles" eyebrow="Operate" title="Workspace & roles">
        <P>
          Everything you create lives in a <b>workspace</b> shared with your team. Access is governed by a
          role/capability model — each role grants a set of capabilities, and every action that changes data
          is guarded by the capability it requires.
        </P>
        <Table
          head={["Role", "Typical capabilities"]}
          rows={[
            ["Admin", "Manage the workspace, users, sources, and all content"],
            ["Editor / Analyst", "Create and edit sources, charts, dashboards; run AI & SQL"],
            ["Viewer", "Open shared dashboards, filter, and export — no editing"],
          ]}
        />
        <Note kind="tip">Owners and admins can always edit content they own; other members are limited to what their role allows.</Note>
      </Section>

      {/* ───── Performance ───── */}
      <Section id="performance" eyebrow="Operate" title="Performance & caching">
        <P>DataMind is built to stay fast as your team and data grow. Several layers cooperate:</P>
        <Table
          head={["Layer", "What it does"]}
          rows={[
            [<b>Result cache</b>, "Dashboard panel results are cached (shared, gzipped, with a TTL) so repeat views and multiple viewers reuse one query run."],
            [<b>Batch render</b>, "A board loads all its panels in one request instead of one-by-one, cutting cold-load time."],
            [<b>Prompt caching</b>, "The stable prompt prefix is cached by the model provider for cheaper, faster AI answers."],
            [<b>Production build</b>, "Pre-compiled frontend serves pages in milliseconds vs. on-the-fly dev compilation."],
          ]}
        />
        <Note kind="info">
          The result cache stores compact query results, not your full datasets, and refreshes on a TTL — so it
          stays small while letting many users work at once. A manual refresh bypasses the cache and repopulates
          it for everyone.
        </Note>
      </Section>

      {/* ───── FAQ ───── */}
      <Section id="faq" eyebrow="Help" title="FAQ & troubleshooting">
        <Sub>A control or dropdown won&apos;t respond after an update</Sub>
        <P>
          You may be on a stale cached bundle. Hard-refresh with <Code>Ctrl+Shift+R</Code>, or open the app in a
          private window to bypass the cache. If it works in private browsing, clear site data for the app domain.
        </P>
        <Sub>My AI answer used the wrong column or metric</Sub>
        <P>
          Improve the <a href="#semantic" className="text-blue-600 font-medium">semantic layer</a>: add a description
          or synonym for the term, or define the metric explicitly. Then re-ask. You can also edit the generated SQL
          directly and re-run.
        </P>
        <Sub>A query says it&apos;s read-only / was rejected</Sub>
        <P>
          That&apos;s the safety guard. DataMind only runs read queries (<Code>SELECT</Code>). Rewrite the statement to
          read data rather than modify it.
        </P>
        <Sub>A dashboard feels slow on first load</Sub>
        <P>
          The first load runs every query cold; subsequent loads hit the result cache and are much faster. Use
          auto-refresh sparingly on heavy boards, and prefer aggregating in SQL over returning huge result sets.
        </P>
      </Section>

      {/* ───── Shortcuts ───── */}
      <Section id="shortcuts" eyebrow="Help" title="Tips & shortcuts">
        <Bullets items={[
          <>Aggregate in SQL (<Code>GROUP BY</Code>) for KPI numbers — the <b>Big number</b> chart shows the first row&apos;s value.</>,
          <>Use <b>Suggestions</b> to discover a good chart fast, then fine-tune in panel options.</>,
          <>Set a per-chart <b>palette</b> to make one panel stand out on a busy board.</>,
          <>Add <b>query variables</b> for date ranges so viewers can re-scope a whole dashboard from one input.</>,
          <>Turn on <b>data labels</b> + a value <b>suffix</b> (like <Code>%</Code>) for presentation-ready charts.</>,
          <>Hit <b>Refresh now</b> before a live demo to guarantee fresh numbers.</>,
        ]} />
        <Note kind="tip">
          Ready to dive in? <Link href="/dashboard" className="text-blue-600 font-semibold">Open the app →</Link>
        </Note>
      </Section>
    </>
  )
}
