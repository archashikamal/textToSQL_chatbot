import { useState } from 'react'
import { explainSql } from '../services/api'

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'GROUP', 'BY', 'ORDER',
  'LIMIT', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'IN',
  'IS', 'NULL', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'HAVING',
  'ASC', 'DESC', 'BETWEEN', 'LIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
])

/** Very small tokenizer that highlights SQL keywords; not a full grammar. */
function highlight(sql) {
  return sql.split(/(\s+|[(),])/).map((token, i) => {
    const upper = token.toUpperCase()
    if (SQL_KEYWORDS.has(upper)) {
      return (
        <span key={i} className="font-semibold text-sky-300">
          {token}
        </span>
      )
    }
    if (/^'.*'$/.test(token) || /^".*"$/.test(token)) {
      return (
        <span key={i} className="text-amber-300">
          {token}
        </span>
      )
    }
    if (/^\d+(\.\d+)?$/.test(token)) {
      return (
        <span key={i} className="text-emerald-300">
          {token}
        </span>
      )
    }
    return token
  })
}

/**
 * "Explain SQL" is opt-in: nothing is requested from the backend until the
 * user clicks it, and once an explanation is loaded, toggling visibility
 * again never re-calls the API.
 */
function useExplain(sql, question) {
  const [state, setState] = useState('idle') // idle | loading | loaded | error
  const [explanation, setExplanation] = useState(null)
  const [error, setError] = useState(null)
  const [visible, setVisible] = useState(false)

  async function trigger() {
    if (state === 'loaded') {
      setVisible((v) => !v)
      return
    }

    setState('loading')
    setError(null)
    const result = await explainSql(sql, question)

    if (result.success) {
      setExplanation(result.explanation)
      setState('loaded')
      setVisible(true)
    } else {
      setError(result.error || 'Could not generate an explanation.')
      setState('error')
    }
  }

  const label =
    state === 'loading'
      ? 'Explaining…'
      : state === 'loaded'
        ? visible
          ? 'Hide Explanation'
          : 'Show Explanation'
        : state === 'error'
          ? 'Retry Explain'
          : 'Explain SQL'

  return { state, explanation, error, visible, label, trigger }
}

export default function SqlViewer({ sql, question }) {
  const [copied, setCopied] = useState(false)
  const explain = useExplain(sql, question)

  if (!sql) return null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) -- fail silently,
      // the SQL is still visible and selectable.
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          Generated SQL
        </span>
        <div className="flex items-center gap-1.5">
          {question && (
            <button
              type="button"
              onClick={explain.trigger}
              disabled={explain.state === 'loading'}
              aria-expanded={explain.state === 'loaded' ? explain.visible : undefined}
              className="rounded px-2 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-wait disabled:opacity-60"
            >
              {explain.label}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="rounded px-2 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="thin-scrollbar-dark overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-200">
        <code>{highlight(sql)}</code>
      </pre>
      {explain.state === 'error' && (
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-2.5 text-xs text-red-400">{explain.error}</div>
      )}
      {explain.state === 'loaded' && explain.visible && (
        <div className="border-t border-slate-800 bg-slate-800/50 px-4 py-2.5 text-[13px] leading-relaxed text-slate-300">
          <span className="mb-1 block text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Explanation
          </span>
          {explain.explanation}
        </div>
      )}
    </div>
  )
}
