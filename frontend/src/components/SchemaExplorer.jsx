import { useMemo, useState } from 'react'

/** Tree-branch glyph: "├─ " for a middle item, "└─ " for the last one in its list. */
function branch(isLast) {
  return isLast ? '└─' : '├─'
}

function ColumnRow({ column, isLast }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 pl-1 font-mono text-[11px] leading-tight">
      <span className="flex-shrink-0 text-slate-600 select-none">{branch(isLast)}</span>
      <span className="truncate text-slate-300">{column.name}</span>
      {column.primary_key && (
        <span className="flex-shrink-0 rounded bg-amber-500/10 px-1 text-[9px] font-semibold text-amber-400">
          PK
        </span>
      )}
      {column.type && <span className="ml-auto flex-shrink-0 truncate text-[10px] text-slate-500">{column.type}</span>}
    </div>
  )
}

function TableNode({ table, isLast, open, onToggle }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] text-slate-300 transition-colors hover:bg-slate-800"
      >
        <span className="flex-shrink-0 font-mono text-slate-600 select-none">{branch(isLast)}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-2.5 w-2.5 flex-shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="truncate font-medium">{table.table}</span>
        <span className="ml-auto flex-shrink-0 text-[10px] text-slate-500">{table.columns.length}</span>
      </button>

      {open && (
        <div className="thin-scrollbar-dark ml-3.5 max-h-40 overflow-y-auto border-l border-slate-800 pl-2">
          {table.columns.map((col, i) => (
            <ColumnRow key={col.name} column={col} isLast={i === table.columns.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function SchemaSkeleton() {
  return (
    <div className="space-y-1.5 px-1">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-slate-800" />
      ))}
    </div>
  )
}

export default function SchemaExplorer({ tables, loading, error }) {
  const [search, setSearch] = useState('')
  const [openTables, setOpenTables] = useState(() => new Set())
  const searching = Boolean(search.trim())

  function toggleTable(name) {
    setOpenTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return tables
    const q = search.trim().toLowerCase()
    return tables
      .map((t) => ({
        ...t,
        columns: t.table.toLowerCase().includes(q)
          ? t.columns
          : t.columns.filter((c) => c.name.toLowerCase().includes(q)),
      }))
      .filter((t) => t.table.toLowerCase().includes(q) || t.columns.length > 0)
  }, [tables, search])

  if (loading) return <SchemaSkeleton />

  if (error) {
    return (
      <p className="flex items-start gap-1.5 px-1 text-xs text-red-400">
        <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.516 2.63H3.72c-1.347 0-2.189-1.463-1.516-2.63L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
        Could not load schema: {error}
      </p>
    )
  }

  if (!tables.length) {
    return <p className="px-1 text-xs text-slate-500">No tables found in the database.</p>
  }

  return (
    <div className="space-y-1.5">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter tables & columns…"
        aria-label="Filter tables and columns"
        className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
      />
      <div className="thin-scrollbar-dark max-h-64 overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <p className="px-1 py-1 text-xs text-slate-500">No matches.</p>
        ) : (
          filtered.map((t, i) => (
            <TableNode
              key={t.table}
              table={t}
              isLast={i === filtered.length - 1}
              open={searching || openTables.has(t.table)}
              onToggle={() => toggleTable(t.table)}
            />
          ))
        )}
      </div>
    </div>
  )
}
