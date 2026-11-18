"use client"

import { useState, useEffect, useRef } from "react"

const DEMOS = [
  {
    question: "Show top 5 products by revenue this month",
    sqlLines: [
      { t: "keyword", v: "SELECT " },   { t: "col", v: "p.name" },
      { t: "plain",   v: ", " },         { t: "fn",  v: "SUM" },
      { t: "plain",   v: "(o.amount) " },{ t: "keyword", v: "AS " },
      { t: "col",     v: "revenue\n" },
      { t: "keyword", v: "FROM " },      { t: "tbl", v: "orders" },
      { t: "plain",   v: " o " },        { t: "keyword", v: "JOIN " },
      { t: "tbl",     v: "products" },   { t: "plain", v: " p " },
      { t: "keyword", v: "ON " },        { t: "col",  v: "p.id " },
      { t: "plain",   v: "= " },         { t: "col",  v: "o.product_id\n" },
      { t: "keyword", v: "ORDER BY " },  { t: "col",  v: "revenue " },
      { t: "keyword", v: "DESC LIMIT " },{ t: "num",  v: "5" },
    ],
    bars: [
      { label: "iPhone 15",    pct: 93 },
      { label: "MacBook Pro",  pct: 77 },
      { label: "AirPods Pro",  pct: 64 },
      { label: "iPad Air",     pct: 52 },
      { label: "Apple Watch",  pct: 43 },
    ],
    time: "0.7s",
    chartType: "hbar",
  },
  {
    question: "Monthly revenue trend for the year",
    sqlLines: [
      { t: "keyword", v: "SELECT " },
      { t: "fn",      v: "DATE_TRUNC" },
      { t: "plain",   v: "(" },         { t: "str",  v: "'month'" },
      { t: "plain",   v: ", date) " },  { t: "keyword", v: "AS " },
      { t: "col",     v: "month\n" },
      { t: "plain",   v: "     , " },   { t: "fn",  v: "SUM" },
      { t: "plain",   v: "(amount) " }, { t: "keyword", v: "AS " },
      { t: "col",     v: "revenue\n" },
      { t: "keyword", v: "FROM " },     { t: "tbl", v: "orders\n" },
      { t: "keyword", v: "GROUP BY " }, { t: "num",  v: "1 " },
      { t: "keyword", v: "ORDER BY " }, { t: "num",  v: "1" },
    ],
    bars: [
      { label: "Jan", pct: 42 }, { label: "Feb", pct: 55 },
      { label: "Mar", pct: 48 }, { label: "Apr", pct: 68 },
      { label: "May", pct: 74 }, { label: "Jun", pct: 63 },
      { label: "Jul", pct: 81 }, { label: "Aug", pct: 88 },
      { label: "Sep", pct: 77 }, { label: "Oct", pct: 92 },
      { label: "Nov", pct: 85 }, { label: "Dec", pct: 100 },
    ],
    time: "0.9s",
    chartType: "vbar",
  },
] as const

type Phase = "typing" | "loading" | "result"

const TOKEN_COLORS: Record<string, string> = {
  keyword: "text-violet-600",
  fn:      "text-cyan-600",
  col:     "text-blue-600",
  tbl:     "text-emerald-600",
  str:     "text-amber-600",
  num:     "text-orange-500",
  plain:   "text-slate-700",
}

const TABLES = ["orders", "customers", "products", "revenue", "sessions"]

export default function HeroDemo() {
  const [demoIdx, setDemoIdx] = useState(0)
  const [phase,   setPhase]   = useState<Phase>("typing")
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const demo = DEMOS[demoIdx]

  useEffect(() => {
    timerRef.current = setTimeout(() => setPhase("loading"), 1200)
    return () => clearTimeout(timerRef.current!)
  }, [demoIdx])

  useEffect(() => {
    if (phase !== "loading") return
    timerRef.current = setTimeout(() => setPhase("result"), 800)
    return () => clearTimeout(timerRef.current!)
  }, [phase])

  useEffect(() => {
    if (phase !== "result") return
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        setDemoIdx((i) => (i + 1) % DEMOS.length)
        setPhase("typing")
        setVisible(true)
      }, 400)
    }, 5000)
    return () => clearTimeout(timerRef.current!)
  }, [phase])

  return (
    <div className={`relative transition-opacity duration-400 ${visible ? "opacity-100" : "opacity-0"}`}>
      {/* Outer glow */}
      <div className="absolute -inset-4 bg-blue-100/60 rounded-3xl blur-3xl pointer-events-none" />

      {/* Window chrome */}
      <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-slate-200/80"
        style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>

        {/* Title bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100"
          style={{ background: "#f8fafc" }}>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <div className="flex items-center gap-2 flex-1 justify-center">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-slate-500 text-xs font-mono">DataMind — sales_analytics</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex" style={{ minHeight: "360px" }}>

          {/* Sidebar */}
          <div className="w-44 border-r border-slate-100 shrink-0 flex flex-col"
            style={{ background: "#f8fafc" }}>
            <div className="p-3">
              {/* DB connection badge */}
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-4"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-green-500" />
                </span>
                <span className="text-green-700 text-xs font-semibold">sales_db</span>
              </div>

              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest px-1 mb-2">Tables</p>
              {TABLES.map((t, i) => (
                <div key={t}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs mb-0.5 cursor-pointer transition-colors ${
                    i === 0 ? "text-blue-700" : "text-slate-400 hover:text-slate-700"
                  }`}
                  style={i === 0 ? { background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.15)" } : {}}
                >
                  <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4h14v8a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"/>
                  </svg>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Main panel */}
          <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">

            {/* User message */}
            <div className="flex items-start gap-2.5 animate-fade-in">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
                U
              </div>
              <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-800 max-w-[85%]"
                style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                {demo.question}
                {phase === "typing" && (
                  <span className="ml-0.5 inline-block w-0.5 h-4 bg-blue-500 animate-blink align-middle" />
                )}
              </div>
            </div>

            {/* Loading state */}
            {phase === "loading" && (
              <div className="flex items-center gap-2 text-slate-400 text-xs pl-10 animate-fade-in">
                <svg className="w-3.5 h-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating SQL...
              </div>
            )}

            {/* AI result */}
            {phase === "result" && (
              <div className="flex items-start gap-2.5 animate-fade-in">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
                  AI
                </div>
                <div className="flex-1 space-y-3">
                  {/* Status badge */}
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                      SQL generated · {demo.time}
                    </span>
                    <span className="text-slate-300 text-xs">·</span>
                    <span className="text-slate-400 text-xs">12 rows</span>
                  </div>

                  {/* SQL block */}
                  <div className="rounded-xl p-3 text-xs font-mono leading-relaxed overflow-x-auto"
                    style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    {demo.sqlLines.map((tok, i) => (
                      <span key={i} className={TOKEN_COLORS[tok.t] ?? "text-slate-700"}>
                        {(tok.v as string) === "\n" ? <br /> : tok.v}
                      </span>
                    ))}
                  </div>

                  {/* Chart */}
                  <div className="rounded-xl p-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-slate-700 text-xs font-semibold">
                        {demo.chartType === "hbar" ? "Top Products · Revenue" : "Monthly Revenue · 2024"}
                      </span>
                      <div className="flex gap-1">
                        {["bar", "line", "pie"].map((t) => (
                          <button key={t}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              t === "bar"
                                ? "text-blue-600 bg-blue-50"
                                : "text-slate-400 hover:text-slate-600"
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Horizontal bars */}
                    {demo.chartType === "hbar" && (
                      <div className="space-y-2">
                        {demo.bars.map((bar, i) => (
                          <div key={bar.label} className="flex items-center gap-2">
                            <span className="text-slate-500 text-[10px] w-20 shrink-0 text-right truncate">{bar.label}</span>
                            <div className="flex-1 rounded-full overflow-hidden" style={{ height: "14px", background: "#e2e8f0" }}>
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${bar.pct}%`,
                                  background: `linear-gradient(90deg, #2563eb, #06b6d4)`,
                                  animation: `fadeInRight 0.5s ease ${i * 0.1}s both`,
                                }}
                              />
                            </div>
                            <span className="text-slate-500 text-[10px] w-8 shrink-0">{bar.pct}%</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Vertical bars */}
                    {demo.chartType === "vbar" && (
                      <div>
                        <svg viewBox="0 0 300 70" className="w-full" style={{ height: "60px" }}>
                          {demo.bars.map((bar, i) => {
                            const w = 16
                            const gap = 300 / demo.bars.length
                            const x = i * gap + (gap - w) / 2
                            const h = (bar.pct / 100) * 60
                            return (
                              <g key={bar.label}>
                                <rect
                                  x={x} y={70 - h} width={w} height={h} rx="3"
                                  fill={i === demo.bars.length - 1 ? "#06b6d4" : "#2563eb"}
                                  opacity={0.5 + i * 0.04}
                                >
                                  <animate attributeName="height" from="0" to={h}
                                    begin={`${i * 0.08}s`} dur="0.5s" fill="freeze"/>
                                  <animate attributeName="y" from="70" to={70 - h}
                                    begin={`${i * 0.08}s`} dur="0.5s" fill="freeze"/>
                                </rect>
                              </g>
                            )
                          })}
                        </svg>
                        <div className="flex justify-between mt-1">
                          {demo.bars.map((b) => (
                            <span key={b.label} className="text-slate-400" style={{ fontSize: "8px" }}>{b.label}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-100 px-4 py-3" style={{ background: "#f8fafc" }}>
          <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 bg-white"
            style={{ border: "1px solid #e2e8f0" }}>
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            <span className="flex-1 text-slate-400 text-sm">Ask anything about your data...</span>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
              style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)" }}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Demo switcher dots */}
      <div className="flex justify-center gap-2 mt-4">
        {DEMOS.map((_, i) => (
          <button
            key={i}
            onClick={() => { setDemoIdx(i); setPhase("typing"); setVisible(true) }}
            className={`rounded-full transition-all duration-300 ${
              i === demoIdx ? "w-6 h-1.5 bg-blue-500" : "w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400"
            }`}
          />
        ))}
      </div>
    </div>
  )
}
