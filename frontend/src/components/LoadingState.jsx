/**
 * Skeleton shown in place of an assistant response while a query is in flight.
 *
 * This is intentionally a single generic state ("Running your query…"), not a
 * fake multi-step progress indicator ("Retrieving schema…" / "Generating
 * SQL…" / "Executing query…"). The backend's /api/query is one request/
 * response call with no stage-by-stage progress events, so showing distinct
 * "steps" here would be fabricated, not real status. If the backend is later
 * changed to stream real stage events, this is the place to switch to showing
 * them.
 */
export default function LoadingState() {
  return (
    <div role="status" aria-label="Running query" className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <svg className="h-4 w-4 flex-shrink-0 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Running your query…
      </div>
      <div className="animate-pulse space-y-2">
        <div className="h-20 w-full rounded-lg bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-5/6 rounded bg-slate-100" />
        <div className="h-3 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  )
}
