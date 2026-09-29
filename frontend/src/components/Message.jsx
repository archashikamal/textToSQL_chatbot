import { useMemo, useState } from 'react'
import ChartView from './ChartView'
import { analyzeChart } from '../utils/chartAnalysis'
import { downloadCsv, rowsToCsv } from '../utils/csv'
import { humanizeError } from '../utils/errorMessages'
import { formatDuration } from '../utils/format'
import LoadingState from './LoadingState'
import ResultTable from './ResultTable'
import SqlViewer from './SqlViewer'

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function UserBubble({ question, timestamp }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
        <p className="whitespace-pre-wrap">{question}</p>
        <p className="mt-1 text-right text-[11px] text-indigo-200">{formatTime(timestamp)}</p>
      </div>
    </div>
  )
}

/** Turn a question into a short, filesystem-safe filename stem. */
function slugify(text) {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return slug || 'query-results'
}

/**
 * Downloads exactly the columns/rows already displayed -- generated entirely
 * client-side (see ../utils/csv.js), so this never re-runs the query against
 * the backend/LLM and works even if the backend is unreachable.
 */
function DownloadCsvButton({ question, columns, rows, disabled }) {
  const [state, setState] = useState('idle') // idle | error

  function handleClick() {
    try {
      const csv = rowsToCsv(columns, rows)
      downloadCsv(`${slugify(question)}.csv`, csv)
    } catch (err) {
      setState('error')
      // eslint-disable-next-line no-console
      console.error('CSV export failed:', err)
      setTimeout(() => setState('idle'), 2500)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M10 12.5a.75.75 0 0 1-.53-.22l-3.5-3.5a.75.75 0 1 1 1.06-1.06L9.25 9.94V3.75a.75.75 0 0 1 1.5 0v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-.53.22Z" />
        <path d="M3.75 13a.75.75 0 0 1 .75.75v1.5c0 .414.336.75.75.75h9.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A2.25 2.25 0 0 1 14.75 17h-9.5A2.25 2.25 0 0 1 3 14.75v-1.5a.75.75 0 0 1 .75-.75Z" />
      </svg>
      {state === 'error' ? 'Download failed' : 'Download CSV'}
    </button>
  )
}

function ErrorBanner({ error }) {
  const [showDetails, setShowDetails] = useState(false)
  const { message, technical } = humanizeError(error)

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 flex-shrink-0">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.516 2.63H3.72c-1.347 0-2.189-1.463-1.516-2.63L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
        <p>{message}</p>
      </div>
      {technical && (
        <div className="mt-1.5 pl-6">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="text-xs font-medium text-red-600/80 underline decoration-dotted underline-offset-2 hover:text-red-700"
          >
            {showDetails ? 'Hide technical details' : 'Show technical details'}
          </button>
          {showDetails && (
            <pre className="thin-scrollbar mt-1.5 max-h-32 overflow-auto rounded border border-red-200 bg-white/60 p-2 font-mono text-[11px] whitespace-pre-wrap text-red-700/90">
              {technical}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function AssistantResult({ result }) {
  const [tab, setTab] = useState('table')
  const chart = useMemo(
    () => (result.success ? analyzeChart(result.columns, result.rows) : null),
    [result.success, result.columns, result.rows],
  )
  const chartable = Boolean(chart)

  if (!result.success) {
    return (
      <div className="space-y-3">
        {result.sql && <SqlViewer sql={result.sql} question={result.question} />}
        <ErrorBanner error={result.error} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <SqlViewer sql={result.sql} question={result.question} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Results</span>
          {chartable && (
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
              {['table', 'chart'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`rounded px-2.5 py-1 capitalize transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                    tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          )}
        </div>
        <DownloadCsvButton
          question={result.question}
          columns={result.columns}
          rows={result.rows}
          disabled={!result.rows?.length}
        />
      </div>

      {chartable && tab === 'chart' ? (
        <ChartView chart={chart} rows={result.rows} />
      ) : (
        <ResultTable columns={result.columns} rows={result.rows} />
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span>{result.row_count ?? 0} row{result.row_count === 1 ? '' : 's'}</span>
        {formatDuration(result.execution_time_ms) && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(result.execution_time_ms)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function Message({ message }) {
  return (
    <div className="space-y-3">
      <UserBubble question={message.question} timestamp={message.timestamp} />
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          {message.status === 'loading' ? <LoadingState /> : <AssistantResult result={message.result} />}
        </div>
      </div>
    </div>
  )
}
