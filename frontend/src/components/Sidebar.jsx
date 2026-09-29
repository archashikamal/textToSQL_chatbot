import SchemaExplorer from './SchemaExplorer'

function timeAgo(isoTimestamp) {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function HistoryList({ history, onSelect }) {
  if (!history.length) {
    return <p className="px-2 text-xs text-slate-500">No queries yet — ask something to get started.</p>
  }

  return (
    <div className="thin-scrollbar-dark max-h-64 space-y-0.5 overflow-y-auto">
      {history.map((item) => {
        const cached = Boolean(item.columns && item.rows)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            title={cached ? 'Restores the previous result instantly' : 'Runs this question again'}
            className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-800"
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${cached ? 'bg-emerald-500' : 'bg-slate-600'}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-slate-300 group-hover:text-slate-100">
                {item.question}
              </span>
              <span className="text-[11px] text-slate-500">
                {timeAgo(item.timestamp)}
                {typeof item.rowCount === 'number' && ` · ${item.rowCount} row${item.rowCount === 1 ? '' : 's'}`}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function HealthBadge({ health }) {
  if (!health) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-600" />
        Checking backend…
      </div>
    )
  }

  const ok = health.status === 'ok'
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400" title={health.database_error || undefined}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {ok ? 'Backend connected' : 'Backend degraded'}
    </div>
  )
}

export default function Sidebar({
  onNewQuery,
  history,
  onSelectHistory,
  onClearHistory,
  tables,
  schemaLoading,
  schemaError,
  health,
  open,
  onClose,
}) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-shrink-0 -translate-x-full transform flex-col bg-slate-900 text-slate-100 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : ''
        }`}
      >
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          DS
        </div>
        <div>
          <p className="text-sm font-semibold text-white">DataSage</p>
          <p className="text-[11px] text-slate-500">Text-to-SQL Analytics</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 md:hidden"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNewQuery}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          New Query
        </button>
      </div>

      <div className="thin-scrollbar-dark flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Recent Queries</h3>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="text-[11px] font-medium text-slate-500 transition-colors hover:text-red-400"
              >
                Clear
              </button>
            )}
          </div>
          <HistoryList history={history} onSelect={onSelectHistory} />
        </section>

        <section>
          <h3 className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            Database Schema
          </h3>
          <SchemaExplorer tables={tables} loading={schemaLoading} error={schemaError} />
        </section>
      </div>

      <div className="border-t border-slate-800 px-4 py-3">
        <HealthBadge health={health} />
      </div>
      </aside>
    </>
  )
}
