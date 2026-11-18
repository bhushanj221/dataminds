"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet } from "@/lib/auth-store"

interface ColumnInfo { name: string; type: string; nullable: boolean; primary_key: boolean; references: string | null }
interface Relationship { columns: string[]; ref_table: string; ref_columns: string[]; ref_schema: string | null }
interface TableInfo { name: string; schema_name: string | null; columns: ColumnInfo[]; foreign_keys: Relationship[] }

interface Source { id: number; name: string; type: string }

export default function SchemaViewer({ source, token, onBack }: {
  source: Source
  token: string
  onBack: () => void
}) {
  const [tables, setTables] = useState<TableInfo[] | null>(null)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [rowCounts, setRowCounts] = useState<Record<string, number | "loading" | "error">>({})

  useEffect(() => {
    apiGet<{ tables: TableInfo[] }>(`/api/sources/${source.id}/schema`, token)
      .then((d) => {
        setTables(d.tables)
        if (d.tables.length) setSelected(`${d.tables[0].schema_name ?? ""}.${d.tables[0].name}`)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load schema"))
  }, [source.id, token])

  const key = (t: TableInfo) => `${t.schema_name ?? ""}.${t.name}`

  // summary stats
  const stats = useMemo(() => {
    if (!tables) return { tables: 0, columns: 0, rels: 0 }
    return {
      tables: tables.length,
      columns: tables.reduce((n, t) => n + t.columns.length, 0),
      rels: tables.reduce((n, t) => n + t.foreign_keys.length, 0),
    }
  }, [tables])

  // incoming FKs: which tables reference THIS table
  const referencedBy = useMemo(() => {
    const map: Record<string, { from_table: string; from_cols: string[]; to_cols: string[] }[]> = {}
    if (!tables) return map
    tables.forEach((t) => {
      t.foreign_keys.forEach((fk) => {
        ;(map[fk.ref_table] ||= []).push({
          from_table: t.name, from_cols: fk.columns, to_cols: fk.ref_columns,
        })
      })
    })
    return map
  }, [tables])

  const filtered = useMemo(() => {
    if (!tables) return []
    const q = search.toLowerCase()
    if (!q) return tables
    return tables.filter((t) =>
      t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)))
  }, [tables, search])

  const active = tables?.find((t) => key(t) === selected) ?? null

  async function loadRowCount(t: TableInfo) {
    const k = key(t)
    if (rowCounts[k] !== undefined) return
    setRowCounts((r) => ({ ...r, [k]: "loading" }))
    try {
      const params = new URLSearchParams({ table: t.name })
      if (t.schema_name) params.set("schema", t.schema_name)
      const r = await apiGet<{ row_count: number }>(`/api/sources/${source.id}/row-count?${params}`, token)
      setRowCounts((rc) => ({ ...rc, [k]: r.row_count }))
    } catch {
      setRowCounts((rc) => ({ ...rc, [k]: "error" }))
    }
  }

  useEffect(() => { if (active) loadRowCount(active) /* eslint-disable-next-line */ }, [selected])

  const rc = active ? rowCounts[key(active)] : undefined

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-900">{source.name}</h1>
          <p className="text-xs text-slate-400">Schema explorer · {source.type}</p>
        </div>
        {tables && (
          <div className="flex gap-2">
            <Stat label="Tables" value={stats.tables} color="#2563eb" />
            <Stat label="Columns" value={stats.columns} color="#0891b2" />
            <Stat label="Relationships" value={stats.rels} color="#7c3aed" />
          </div>
        )}
      </div>

      {error ? (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      ) : !tables ? (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-96 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : tables.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm">
          No tables found in this source.
        </div>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          {/* ── Table list ── */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 200px)" }}>
            <div className="p-3 border-b border-slate-100">
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tables & columns…"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400" />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.map((t) => {
                const k = key(t)
                const hasFk = t.foreign_keys.length > 0
                const incoming = (referencedBy[t.name]?.length ?? 0) > 0
                return (
                  <button key={k} onClick={() => setSelected(k)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors mb-0.5 ${
                      selected === k ? "text-blue-700" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    style={selected === k ? { background: "rgba(37,99,235,0.07)" } : {}}>
                    <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                    <span className="text-sm font-medium truncate flex-1">{t.name}</span>
                    {(hasFk || incoming) && (
                      <span title="has relationships" className="text-violet-400 text-[11px]">⇄</span>
                    )}
                    <span className="text-[10px] text-slate-400">{t.columns.length}</span>
                  </button>
                )
              })}
              {filtered.length === 0 && <p className="text-xs text-slate-400 p-2">No matches.</p>}
            </div>
          </div>

          {/* ── Table detail ── */}
          {active && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 200px)" }}>
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-slate-900 font-bold text-sm">{active.name}</h2>
                  {active.schema_name && active.schema_name !== "public" && (
                    <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-50">{active.schema_name}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {active.columns.length} cols ·{" "}
                  {rc === "loading" ? "counting…" : rc === "error" ? "—" : rc !== undefined ? `${rc.toLocaleString()} rows` : ""}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Columns table */}
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-slate-400">
                      <th className="text-left font-medium px-4 py-2">Column</th>
                      <th className="text-left font-medium px-3 py-2">Type</th>
                      <th className="text-left font-medium px-3 py-2">Constraints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.columns.map((c) => (
                      <tr key={c.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono text-slate-800 font-medium">{c.name}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{c.type.toLowerCase()}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {c.primary_key && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">🔑 PK</span>
                            )}
                            {c.references && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
                                🔗 → {c.references}
                              </span>
                            )}
                            {!c.nullable && !c.primary_key && (
                              <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-50">NOT NULL</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Relationships */}
                {(active.foreign_keys.length > 0 || (referencedBy[active.name]?.length ?? 0) > 0) && (
                  <div className="p-4 border-t border-slate-100 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Relationships</p>

                    {active.foreign_keys.length > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1.5 font-medium">References (this → other)</p>
                        <div className="space-y-1.5">
                          {active.foreign_keys.map((fk, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-slate-700">{active.name}.{fk.columns.join(", ")}</span>
                              <svg className="w-3.5 h-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                              </svg>
                              <button onClick={() => setSelected(`${fk.ref_schema ?? active.schema_name ?? ""}.${fk.ref_table}`)}
                                className="font-mono text-violet-600 hover:underline">
                                {fk.ref_table}.{fk.ref_columns.join(", ")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(referencedBy[active.name]?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1.5 font-medium">Referenced by (other → this)</p>
                        <div className="space-y-1.5">
                          {referencedBy[active.name].map((inc, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <button onClick={() => setSelected(`${active.schema_name ?? ""}.${inc.from_table}`)}
                                className="font-mono text-blue-600 hover:underline">
                                {inc.from_table}.{inc.from_cols.join(", ")}
                              </button>
                              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                              </svg>
                              <span className="font-mono text-slate-700">{active.name}.{inc.to_cols.join(", ")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-100 text-center min-w-16">
      <p className="text-lg font-bold leading-none" style={{ color }}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
