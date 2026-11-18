"use client"

import { useEffect, useState } from "react"
import { useAuthStore, apiGet } from "@/lib/auth-store"
import Link from "next/link"

interface Overview { data_sources: number; queries_run: number; dashboards: number; ai_conversations: number }

const QUICK_ACTIONS = [
  {
    title: "Ask AI",
    desc: "Ask anything about your data",
    href: "/dashboard/ai",
    gradient: "linear-gradient(135deg, #2563eb, #7c3aed)",
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
      </svg>
    ),
  },
  {
    title: "SQL Editor",
    desc: "Write and run queries",
    href: "/dashboard/sql",
    gradient: "linear-gradient(135deg, #0891b2, #2563eb)",
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
      </svg>
    ),
  },
  {
    title: "Connect Database",
    desc: "Add a new data source",
    href: "/dashboard/sources",
    gradient: "linear-gradient(135deg, #059669, #0891b2)",
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
      </svg>
    ),
  },
  {
    title: "New Dashboard",
    desc: "Build a visual board",
    href: "/dashboard/boards",
    gradient: "linear-gradient(135deg, #7c3aed, #db2777)",
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/>
      </svg>
    ),
  },
]

const STAT_META = [
  { key: "data_sources", label: "Data Sources", color: "#2563eb", zero: "Connect one to get started", some: "connected" },
  { key: "queries_run", label: "Queries Run", color: "#0891b2", zero: "No queries yet", some: "all time" },
  { key: "dashboards", label: "Dashboards", color: "#7c3aed", zero: "Create your first board", some: "in your workspace" },
  { key: "ai_conversations", label: "AI Conversations", color: "#059669", zero: "Ask anything", some: "conversations" },
] as const

function greeting(name: string) {
  const hour = new Date().getHours()
  const timeGreet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const first = name.split(" ")[0]
  return `${timeGreet}, ${first}`
}

export default function DashboardHome() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const [stats, setStats] = useState<Overview | null>(null)

  useEffect(() => {
    if (!token) return
    apiGet<Overview>("/api/stats/overview", token).then(setStats).catch(() => {})
  }, [token])

  if (!user) return null

  const s = stats ?? { data_sources: 0, queries_run: 0, dashboards: 0, ai_conversations: 0 }
  const gettingStarted = [
    { label: "Create your account", done: true, href: "#" },
    { label: "Connect your first database", done: s.data_sources > 0, href: "/dashboard/sources" },
    { label: "Run your first SQL query", done: s.queries_run > 0, href: "/dashboard/sql" },
    { label: "Ask AI a question about your data", done: s.ai_conversations > 0, href: "/dashboard/ai" },
    { label: "Create a dashboard", done: s.dashboards > 0, href: "/dashboard/boards" },
  ]
  const completedSteps = gettingStarted.filter((st) => st.done).length
  const progress = Math.round((completedSteps / gettingStarted.length) * 100)

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── Hero greeting ── */}
      <div className="rounded-2xl p-6 sm:p-8 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 50%, #faf5ff 100%)", border: "1px solid #e0f2fe" }}>
        {/* Background decoration */}
        <div className="absolute right-0 top-0 w-64 h-64 pointer-events-none opacity-30"
          style={{ background: "radial-gradient(circle at 80% 20%, rgba(37,99,235,0.15), transparent 60%)" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-blue-700 mb-3"
            style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            AI-powered analytics ready
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
            {greeting(user.full_name)} 👋
          </h1>
          <p className="text-slate-500 text-sm sm:text-base max-w-lg">
            Your workspace is ready. Connect a database and start exploring your data with natural language.
          </p>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link href="/dashboard/sources"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #2563eb, #06b6d4)", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Connect database
            </Link>
            <Link href="/dashboard/ai"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:border-blue-300 transition-colors">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              Ask AI a question
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_META.map((m) => {
          const value = s[m.key]
          return (
            <div key={m.key} className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-sm transition-shadow">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">{m.label}</p>
              <p className="text-3xl font-bold mb-0.5" style={{ color: m.color }}>
                {stats === null ? <span className="inline-block w-10 h-7 bg-slate-100 rounded animate-pulse align-middle" /> : value.toLocaleString()}
              </p>
              <p className="text-slate-400 text-xs">{value > 0 ? m.some : m.zero}</p>
            </div>
          )
        })}
      </div>

      {/* ── Quick actions ── */}
      <div>
        <h2 className="text-slate-900 font-semibold text-base mb-4">Quick actions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.title} href={a.href}
              className="group bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md hover:border-blue-100 transition-all">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"
                style={{ background: a.gradient }}>
                {a.icon}
              </div>
              <p className="text-slate-900 font-semibold text-sm mb-1">{a.title}</p>
              <p className="text-slate-400 text-xs">{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* ── Getting started checklist ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-slate-900 font-semibold text-base">Getting started</h2>
              <p className="text-slate-400 text-xs mt-0.5">{completedSteps} of {gettingStarted.length} completed</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-blue-600">{progress}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #2563eb, #06b6d4)" }} />
          </div>

          <ol className="space-y-3">
            {gettingStarted.map((step, i) => (
              <li key={i}>
                <Link href={step.href}
                  className={`flex items-center gap-3 text-sm p-2 -mx-2 rounded-lg transition-colors ${step.done ? "cursor-default" : "hover:bg-slate-50"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    step.done ? "text-white" : "border-2 border-slate-200"
                  }`} style={step.done ? { background: "linear-gradient(135deg, #2563eb, #06b6d4)" } : {}}>
                    {step.done ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    )}
                  </span>
                  <span className={step.done ? "text-slate-400 line-through" : "text-slate-700"}>{step.label}</span>
                  {!step.done && (
                    <svg className="w-3.5 h-3.5 text-slate-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {/* ── Recent activity (empty state) ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-slate-900 font-semibold text-base mb-5">Recent activity</h2>
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "rgba(37,99,235,0.07)" }}>
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <p className="text-slate-600 font-medium text-sm mb-1">No activity yet</p>
            <p className="text-slate-400 text-xs max-w-48">
              Queries, AI conversations, and dashboard edits will appear here.
            </p>
            <Link href="/dashboard/sql"
              className="mt-4 text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Run your first query
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Feature teasers ── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900 font-semibold text-base">Coming soon</h2>
          <span className="text-xs text-slate-400 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100">Roadmap</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: "🤖", title: "AI Text-to-SQL", desc: "Ask questions in plain English, get SQL and charts instantly" },
            { icon: "📊", title: "Smart Dashboards", desc: "Auto-generated visualizations with drill-down and filters" },
            { icon: "🔗", title: "Semantic Layer", desc: "Define business metrics once, query them everywhere" },
          ].map((f) => (
            <div key={f.title} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <div className="text-2xl mb-2">{f.icon}</div>
              <p className="text-slate-800 font-semibold text-sm mb-1">{f.title}</p>
              <p className="text-slate-400 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
