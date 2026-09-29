function formatCell(value) {
  if (value === null || value === undefined) {
    return <span className="text-slate-500 italic">null</span>
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}

function isNumericValue(v) {
  return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))
}

/** A column reads as numeric (and is right-aligned) when every non-null value in it is. */
function isNumericColumn(col, rows) {
  const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '')
  return values.length > 0 && values.every(isNumericValue)
}

function EmptyResult({ message }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-slate-300">
        <path
          d="M9 12h6m-9 8h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-sm font-medium text-slate-600">No results found</p>
      <p className="max-w-xs text-xs text-slate-500">{message}</p>
    </div>
  )
}

export default function ResultTable({ columns, rows }) {
  if (!columns || columns.length === 0) {
    return <EmptyResult message="The query ran successfully but didn't return any columns." />
  }

  if (!rows || rows.length === 0) {
    return (
      <EmptyResult message="The query ran successfully, but no rows matched. Try adjusting your question — a different date range, spelling, or filter may help." />
    )
  }

  // Numeric columns read better right-aligned (e.g. a stack of prices/counts) --
  // computed once per render, purely presentational, doesn't touch the data.
  const numericCols = new Set(columns.filter((col) => isNumericColumn(col, rows)))

  return (
    <div className="thin-scrollbar max-h-96 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-slate-100">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className={`border-b border-slate-200 px-3 py-2 font-semibold whitespace-nowrap text-slate-600 ${
                  numericCols.has(col) ? 'text-right' : 'text-left'
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {columns.map((col) => (
                <td
                  key={col}
                  className={`px-3 py-2 font-mono text-[13px] whitespace-nowrap text-slate-700 tabular-nums ${
                    numericCols.has(col) ? 'text-right' : 'text-left'
                  }`}
                >
                  {formatCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
