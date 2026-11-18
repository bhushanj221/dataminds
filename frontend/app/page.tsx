import Link from "next/link"
import Nav from "@/components/nav"
import HeroDemo from "@/components/hero-demo"

// ── Sparkle decoration ────────────────────────────────────────
function Sparkle({ className = "" }: { className?: string }) {
  return <span className={`text-blue-500 select-none ${className}`}>✦</span>
}

// ── Section badge ─────────────────────────────────────────────
function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4"
      style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)" }}>
      <Sparkle />
      {children}
      <Sparkle />
    </div>
  )
}

// ── Feature card ──────────────────────────────────────────────
function FeatureCard({ icon, title, desc, accent }: {
  icon: React.ReactNode; title: string; desc: string; accent: string
}) {
  return (
    <div className="border-gradient rounded-2xl p-6 glow-card transition-all duration-300 cursor-default group bg-white">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${accent}`}>
        {icon}
      </div>
      <h3 className="text-slate-900 font-semibold mb-2 text-base">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  )
}

// ── Step card ─────────────────────────────────────────────────
function StepCard({ n, title, desc, preview }: {
  n: string; title: string; desc: string; preview: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
          {n}
        </div>
        <div>
          <h3 className="text-slate-900 font-semibold">{title}</h3>
          <p className="text-slate-500 text-sm mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        {preview}
      </div>
    </div>
  )
}

// ── Data sources ──────────────────────────────────────────────
const SOURCES = [
  { name: "PostgreSQL", abbr: "PG",  gradient: "from-blue-600 to-blue-400"    },
  { name: "MySQL",      abbr: "MY",  gradient: "from-orange-500 to-orange-400" },
  { name: "SQLite",     abbr: "SL",  gradient: "from-green-600 to-emerald-400" },
  { name: "BigQuery",   abbr: "BQ",  gradient: "from-blue-500 to-cyan-400"    },
  { name: "Snowflake",  abbr: "SF",  gradient: "from-cyan-600 to-sky-400"     },
  { name: "Redshift",   abbr: "RS",  gradient: "from-red-500 to-rose-400"     },
  { name: "SQL Server", abbr: "SS",  gradient: "from-slate-500 to-slate-400"  },
  { name: "CSV / Excel",abbr: "📄",  gradient: "from-emerald-600 to-teal-400" },
]

// ── Use case cards ────────────────────────────────────────────
const USE_CASES = [
  {
    tag: "Finance",
    title: "Revenue & cost analytics",
    desc: "Track P&L, ARR, churn, CAC and every financial KPI in real-time without a BI analyst.",
    bg: "#eff6ff", border: "#bfdbfe", tagColor: "#1d4ed8",
    icon: "💰",
  },
  {
    tag: "Operations",
    title: "Ops dashboards & SLAs",
    desc: "Monitor pipeline health, fulfillment rates, SLA breaches and team performance.",
    bg: "#f5f3ff", border: "#ddd6fe", tagColor: "#6d28d9",
    icon: "⚙️",
  },
  {
    tag: "Marketing",
    title: "Campaign & funnel analysis",
    desc: "Attribute revenue to campaigns, track funnel conversions and A/B test results.",
    bg: "#ecfeff", border: "#a5f3fc", tagColor: "#0e7490",
    icon: "📣",
  },
  {
    tag: "Product",
    title: "User behaviour & retention",
    desc: "Cohort analysis, feature adoption, retention curves and engagement heatmaps.",
    bg: "#f0fdf4", border: "#bbf7d0", tagColor: "#15803d",
    icon: "🚀",
  },
]

// ── Marquee logos ─────────────────────────────────────────────
const COMPANY_NAMES = [
  "Acme Corp", "TechFlow", "DataStream", "AnalyticsCo",
  "StartupXYZ", "MegaCorp", "CloudBase", "NexaData",
  "Acme Corp", "TechFlow", "DataStream", "AnalyticsCo",
  "StartupXYZ", "MegaCorp", "CloudBase", "NexaData",
]

// ── Testimonials ──────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "DataMind replaced our entire BI stack. Our team went from waiting 3 days for a report to getting answers in seconds.",
    name: "Sarah Chen",
    role: "Head of Analytics · TechFlow",
    avatar: "SC",
  },
  {
    quote: "The AI-generated SQL is shockingly accurate. It even understands our custom column naming conventions.",
    name: "Marcus Rivera",
    role: "CTO · DataStream",
    avatar: "MR",
  },
  {
    quote: "Finally a BI tool that non-technical people can actually use. Our marketing team is completely self-serve now.",
    name: "Priya Patel",
    role: "VP Marketing · NexaData",
    avatar: "PP",
  },
]

// ─── Page ─────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div style={{ background: "#ffffff" }}>
      <Nav />

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">

        {/* Grid background */}
        <div className="absolute inset-0 hero-grid pointer-events-none" />

        {/* Soft radial colour blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-8%] left-[30%] w-[600px] h-[600px] rounded-full blur-[130px] opacity-25"
            style={{ background: "radial-gradient(circle, #bfdbfe, transparent 70%)" }} />
          <div className="absolute bottom-[0%] right-[5%] w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
            style={{ background: "radial-gradient(circle, #ddd6fe, transparent 70%)" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-12 xl:gap-20 items-center">

            {/* ── Copy ── */}
            <div className="max-w-xl">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-8 text-xs font-medium"
                style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)" }}>
                <Sparkle />
                <span className="text-blue-600">AI-powered · Text-to-SQL · Open source</span>
                <Sparkle />
              </div>

              <h1 className="text-5xl xl:text-6xl font-bold text-slate-900 leading-[1.08] tracking-tight mb-6">
                The AI-native BI<br />
                platform for{" "}
                <span className="text-gradient-blue">every team</span>
              </h1>

              <p className="text-lg text-slate-500 leading-relaxed mb-10 max-w-lg">
                Connect any database. Ask questions in plain English.
                Get instant SQL, beautiful charts and collaborative dashboards —
                no BI expertise required.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3 mb-10">
                <Link href="/register"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white glow-btn transition-all"
                  style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
                  Start for free
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                </Link>
                <a href="#how-it-works"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all">
                  Schedule a demo
                </a>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {[
                  { icon: "✦", text: "1,200+ GitHub stars" },
                  { icon: "✦", text: "No credit card" },
                  { icon: "✦", text: "Self-hostable" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-1.5 text-slate-400 text-sm">
                    <span className="text-blue-400 text-xs">{item.icon}</span>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Animated demo ── */}
            <div className="w-full">
              <HeroDemo />
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-32 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #ffffff)" }} />
      </section>

      {/* ══════════════════════════════════════════════════
          MARQUEE STRIP
      ══════════════════════════════════════════════════ */}
      <div className="py-8 overflow-hidden bg-slate-50 border-y border-slate-100">
        <p className="text-center text-slate-400 text-xs font-semibold uppercase tracking-widest mb-6">
          Trusted by teams at
        </p>
        <div className="flex">
          <div className="animate-marquee flex shrink-0 gap-12 pr-12">
            {COMPANY_NAMES.map((n, i) => (
              <span key={i} className="text-slate-400 hover:text-slate-600 text-sm font-semibold whitespace-nowrap transition-colors cursor-default">
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════════════ */}
      <section id="features" className="py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <SectionBadge>Features</SectionBadge>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              One platform. Every data need.
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              The best of Grafana, Superset, Power BI and WrenAI — without the complexity or cost.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
              title="AI Text-to-SQL"
              desc="Ask questions in plain English. Claude or GPT-4 generates accurate SQL, executes it, and shows you the results — all in under a second."
              accent="bg-blue-50 text-blue-600"
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
              title="50+ Chart Types"
              desc="Bar, line, scatter, heatmap, sankey, treemap, funnel, gauge, geo maps and more — auto-selected based on your data shape."
              accent="bg-cyan-50 text-cyan-600"
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>}
              title="Full SQL Editor"
              desc="CodeMirror-powered editor with syntax highlighting, schema autocomplete, multi-tab queries and execution history."
              accent="bg-violet-50 text-violet-600"
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>}
              title="10+ Database Connectors"
              desc="PostgreSQL, MySQL, SQLite, BigQuery, Snowflake, Redshift, SQL Server and more. CSV and Excel upload also supported."
              accent="bg-emerald-50 text-emerald-600"
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/></svg>}
              title="Drag-and-drop Dashboards"
              desc="Build dashboards by arranging chart tiles, KPI cards, text blocks and filters. Share with a link or embed anywhere."
              accent="bg-orange-50 text-orange-500"
            />
            <FeatureCard
              icon={<svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
              title="Team Collaboration"
              desc="Role-based access, workspace sharing, comment threads on charts, scheduled email reports and Slack alerts."
              accent="bg-pink-50 text-pink-500"
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-20">
            <SectionBadge>How it works</SectionBadge>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              From database to dashboard in minutes
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              No complex setup. No training. No data engineering. Just connect and ask.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-5 left-[22%] right-[22%] h-px"
              style={{ background: "linear-gradient(90deg, transparent, #2563eb, #06b6d4, transparent)" }} />

            {/* Step 1 */}
            <StepCard
              n="01"
              title="Connect your database"
              desc="Paste a connection string. Done in 30 seconds."
              preview={
                <div className="p-5">
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">Connection</p>
                  <div className="rounded-lg px-3 py-2 font-mono text-xs mb-3 bg-slate-50"
                    style={{ border: "1px solid #e2e8f0" }}>
                    <span className="text-slate-400">postgresql://</span>
                    <span className="text-emerald-600">admin</span>
                    <span className="text-slate-400">:</span>
                    <span className="text-slate-300">••••••</span>
                    <span className="text-slate-400">@</span>
                    <span className="text-blue-600">db.mycompany.com</span>
                    <span className="text-slate-400">/sales</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                    </svg>
                    Connected · 24 tables discovered
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1">
                    {["orders", "customers", "products", "revenue"].map((t) => (
                      <div key={t} className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-slate-500 bg-slate-50 border border-slate-200">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2H3V4zm0 4h14v8a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"/>
                        </svg>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              }
            />

            {/* Step 2 */}
            <StepCard
              n="02"
              title="Ask in plain English"
              desc="No SQL knowledge needed. Just type your question."
              preview={
                <div className="p-5 space-y-3">
                  <div className="rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-blue-50"
                    style={{ border: "1px solid #bfdbfe" }}>
                    What was the revenue by region last quarter?
                  </div>
                  <div className="rounded-lg p-3 font-mono text-xs leading-relaxed bg-slate-50"
                    style={{ border: "1px solid #e2e8f0" }}>
                    <span className="text-violet-600">SELECT </span>
                    <span className="text-blue-600">region</span>
                    <span className="text-slate-500">,</span><br/>
                    <span className="text-violet-600">       SUM</span>
                    <span className="text-slate-700">(amount) </span>
                    <span className="text-violet-600">AS </span>
                    <span className="text-blue-600">revenue</span><br/>
                    <span className="text-violet-600">FROM </span>
                    <span className="text-emerald-600">orders</span><br/>
                    <span className="text-violet-600">WHERE </span>
                    <span className="text-blue-600">quarter </span>
                    <span className="text-slate-700">= </span>
                    <span className="text-amber-600">&apos;Q3 2024&apos;</span><br/>
                    <span className="text-violet-600">GROUP BY </span>
                    <span className="text-orange-500">1</span>
                  </div>
                  <div className="text-xs text-emerald-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Generated in 0.8s · 4 rows returned
                  </div>
                </div>
              }
            />

            {/* Step 3 */}
            <StepCard
              n="03"
              title="Get charts & dashboards"
              desc="Results visualised instantly. Build dashboards in minutes."
              preview={
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-600 text-xs font-semibold">Revenue by Region · Q3 2024</span>
                    <span className="text-emerald-600 text-xs font-medium">+24% ↑</span>
                  </div>
                  <svg viewBox="0 0 240 80" className="w-full" style={{ height: "72px" }}>
                    {[
                      { label: "APAC",  h: 65, x: 10  },
                      { label: "EMEA",  h: 50, x: 70  },
                      { label: "NA",    h: 75, x: 130 },
                      { label: "LATAM", h: 35, x: 190 },
                    ].map((bar, i) => (
                      <g key={bar.label}>
                        <rect x={bar.x} y={80 - bar.h} width="40" height={bar.h} rx="4"
                          fill={i === 2 ? "url(#barGradLight)" : "#bfdbfe"} opacity={0.9}>
                          <animate attributeName="height" from="0" to={bar.h}
                            begin={`${i * 0.12}s`} dur="0.6s" fill="freeze"/>
                          <animate attributeName="y" from="80" to={80 - bar.h}
                            begin={`${i * 0.12}s`} dur="0.6s" fill="freeze"/>
                        </rect>
                        <text x={bar.x + 20} y="78" textAnchor="middle"
                          style={{ fontSize: "7px", fill: "#94a3b8" }}>{bar.label}</text>
                      </g>
                    ))}
                    <defs>
                      <linearGradient id="barGradLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb"/>
                        <stop offset="100%" stopColor="#06b6d4"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="mt-3 flex gap-2">
                    {["Pin to dashboard", "Export CSV"].map((a) => (
                      <button key={a} className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200">
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          CONTEXT LAYER
      ══════════════════════════════════════════════════ */}
      <section className="py-28 bg-white relative overflow-hidden">
        <div className="absolute inset-0 hero-grid pointer-events-none opacity-60" />
        <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[100px] opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(circle, #ddd6fe, transparent 70%)" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* SQL showcase */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg shadow-slate-100">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#febc2e" }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#28c840" }} />
                </div>
                <span className="text-slate-400 text-xs font-mono ml-2">AI-generated SQL</span>
              </div>
              <div className="p-6 font-mono text-sm leading-loose bg-white">
                <div className="text-slate-400 text-xs mb-4">-- User asked: &quot;Top customers by LTV this year&quot;</div>
                <div>
                  <span className="text-violet-600">WITH </span>
                  <span className="text-blue-600">customer_ltv</span>
                  <span className="text-slate-700"> AS (</span>
                </div>
                <div className="ml-4">
                  <span className="text-violet-600">SELECT </span>
                  <span className="text-blue-600">c.id</span>
                  <span className="text-slate-700">, </span>
                  <span className="text-blue-600">c.name</span>
                  <span className="text-slate-700">,</span>
                </div>
                <div className="ml-10">
                  <span className="text-violet-600">SUM</span>
                  <span className="text-slate-700">(</span>
                  <span className="text-blue-600">o.amount</span>
                  <span className="text-slate-700">) </span>
                  <span className="text-violet-600">AS </span>
                  <span className="text-blue-600">ltv</span>
                </div>
                <div className="ml-4">
                  <span className="text-violet-600">FROM </span>
                  <span className="text-emerald-600">customers</span>
                  <span className="text-slate-700"> c</span>
                </div>
                <div className="ml-4">
                  <span className="text-violet-600">  JOIN </span>
                  <span className="text-emerald-600">orders</span>
                  <span className="text-slate-700"> o </span>
                  <span className="text-violet-600">ON </span>
                  <span className="text-blue-600">c.id</span>
                  <span className="text-slate-700"> = </span>
                  <span className="text-blue-600">o.customer_id</span>
                </div>
                <div className="ml-4">
                  <span className="text-violet-600">WHERE </span>
                  <span className="text-violet-600">EXTRACT</span>
                  <span className="text-slate-700">(</span>
                  <span className="text-amber-600">year </span>
                  <span className="text-violet-600">FROM </span>
                  <span className="text-blue-600">o.date</span>
                  <span className="text-slate-700">) = </span>
                  <span className="text-violet-600">EXTRACT</span>
                  <span className="text-slate-700">(</span>
                  <span className="text-amber-600">year </span>
                  <span className="text-violet-600">FROM </span>
                  <span className="text-violet-600">NOW</span>
                  <span className="text-slate-700">())</span>
                </div>
                <div className="ml-4">
                  <span className="text-violet-600">GROUP BY </span>
                  <span className="text-orange-500">1</span>
                  <span className="text-slate-700">, </span>
                  <span className="text-orange-500">2</span>
                </div>
                <div><span className="text-slate-700">)</span></div>
                <div className="mt-2">
                  <span className="text-violet-600">SELECT </span>
                  <span className="text-slate-700">* </span>
                  <span className="text-violet-600">FROM </span>
                  <span className="text-blue-600">customer_ltv</span>
                </div>
                <div>
                  <span className="text-violet-600">ORDER BY </span>
                  <span className="text-blue-600">ltv </span>
                  <span className="text-violet-600">DESC LIMIT </span>
                  <span className="text-orange-500">10</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                  Executed · 10 rows · 124ms
                </div>
              </div>
            </div>

            {/* Right copy */}
            <div>
              <SectionBadge>Semantic layer</SectionBadge>
              <h2 className="text-4xl font-bold text-slate-900 mb-5 leading-tight">
                Context is the foundation<br />
                of <span className="text-gradient-cyan">accurate answers</span>
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed mb-8">
                DataMind auto-bootstraps a semantic layer from your schema on day one.
                It samples column values, infers business metrics and generates synthetic
                Q→SQL examples — so the AI understands <em className="text-slate-700 not-italic font-medium">your</em> data, not just SQL syntax.
              </p>
              <div className="space-y-4">
                {[
                  { icon: "✦", title: "Schema auto-description", desc: "AI reads INFORMATION_SCHEMA and writes human-readable descriptions for every table and column." },
                  { icon: "✦", title: "Column value sampling", desc: "Samples top values from enum-like columns so the AI knows 'status' can be 'active', 'churned', 'trial'." },
                  { icon: "✦", title: "Few-shot learning", desc: "Every thumbs-up on a result trains the model — accuracy improves as your team uses it." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3">
                    <span className="text-blue-500 text-lg mt-0.5 shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-slate-800 font-medium text-sm">{item.title}</p>
                      <p className="text-slate-500 text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          USE CASES
      ══════════════════════════════════════════════════ */}
      <section id="use-cases" className="py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <SectionBadge>Use cases</SectionBadge>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Built for every team and leader
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              From C-suite to analyst. From finance to product. One platform, every use case.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {USE_CASES.map((uc) => (
              <div key={uc.title}
                className="relative rounded-2xl p-6 overflow-hidden group cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
                style={{ background: uc.bg, border: `1px solid ${uc.border}` }}>
                <div className="text-3xl mb-4">{uc.icon}</div>
                <span className="text-xs font-semibold uppercase tracking-widest mb-2 block"
                  style={{ color: uc.tagColor }}>{uc.tag}</span>
                <h3 className="text-slate-900 font-bold text-base mb-2">{uc.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{uc.desc}</p>
                <div className="mt-5 flex items-center gap-1 text-xs text-slate-400 group-hover:text-blue-500 transition-colors">
                  Read use case
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          DATA SOURCES
      ══════════════════════════════════════════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <SectionBadge>Integrations</SectionBadge>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Connect any data source</h2>
          <p className="text-slate-500 mb-12">All major databases, cloud warehouses and file formats supported.</p>

          <div className="flex flex-wrap justify-center gap-3">
            {SOURCES.map((src) => (
              <div key={src.name}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm transition-all hover:-translate-y-0.5 cursor-default">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${src.gradient} shrink-0`}>
                  {src.abbr}
                </div>
                <span className="text-sm font-medium text-slate-700">{src.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <span className="text-sm text-slate-400">+ More coming soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════════════════ */}
      <section className="py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <SectionBadge>Testimonials</SectionBadge>
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Loved by data teams everywhere
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name}
                className="rounded-2xl p-6 bg-white border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all cursor-default">
                <div className="flex gap-1 mb-4">
                  {Array(5).fill(0).map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  ))}
                </div>
                <blockquote className="text-slate-600 text-sm leading-relaxed mb-6">
                  &quot;{t.quote}&quot;
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-semibold">{t.name}</p>
                    <p className="text-slate-400 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          CTA
      ══════════════════════════════════════════════════ */}
      <section className="py-32 relative overflow-hidden bg-white">
        <div className="absolute inset-0 hero-grid pointer-events-none opacity-60" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[100px] opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, #bfdbfe, transparent 70%)" }} />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 text-sm font-medium"
            style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)" }}>
            <Sparkle />
            <span className="text-blue-600">Start for free · No credit card</span>
            <Sparkle />
          </div>

          <h2 className="text-5xl sm:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            One layer, same trusted<br />
            <span className="text-gradient-blue">answer across your company</span>
          </h2>

          <p className="text-slate-500 text-lg mb-12 max-w-xl mx-auto">
            Join thousands of analysts, engineers and executives who replaced slow BI
            workflows with instant, AI-powered answers.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-white glow-btn transition-all"
              style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
              Start for free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </Link>
            <a href="#"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all">
              Schedule a demo
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <span className="text-slate-900 font-bold text-lg">DataMind</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs mb-5">
                The AI-native BI platform. Turn any database into instant, trusted insights for every team.
              </p>
              <div className="flex gap-3">
                {["GitHub", "Twitter", "Discord"].map((s) => (
                  <a key={s} href="#"
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-colors">
                    {s}
                  </a>
                ))}
              </div>
            </div>

            {[
              { title: "Product",   links: ["Features", "How it works", "Pricing", "Changelog", "Roadmap"] },
              { title: "Resources", links: ["Documentation", "API Reference", "Blog", "Community", "Status"] },
              { title: "Company",   links: ["About", "Careers", "Press", "Privacy", "Terms"] },
            ].map((col) => (
              <div key={col.title}>
                <p className="text-slate-900 text-sm font-semibold mb-4">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href={l === "Documentation" ? "/docs" : "#"} className="text-slate-500 hover:text-slate-800 text-sm transition-colors">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 border-t border-slate-200">
            <p className="text-slate-400 text-sm">© 2026 DataMind. All rights reserved.</p>
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Sparkle className="text-xs" />
              Built with FastAPI + Next.js + pgvector
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
