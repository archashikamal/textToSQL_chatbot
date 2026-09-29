/**
 * Client-side query history, persisted to localStorage. This is the "first
 * version" of history: no backend database, no auth, just a per-browser list
 * capped at a reasonable size. Nothing here is sent anywhere -- it's read and
 * written only in this browser tab's origin.
 *
 * Each entry stores: question, generated SQL, timestamp, and row count -- plus
 * (when small enough) the actual columns/rows, so clicking a history item can
 * restore the previous result instantly instead of re-asking the LLM.
 */

const STORAGE_KEY = 'datasage.queryHistory.v1'
const HISTORY_LIMIT = 20
// Cap how much result data we cache per entry so one big query can't bloat
// localStorage (which is usually only a few MB per origin). Above this, we
// still remember the question/SQL/row count, just not the full rows.
const MAX_CACHED_ROWS = 200

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt JSON, or localStorage unavailable (private browsing, disabled
    // storage, etc.) -- degrade gracefully to "no history" rather than throw.
    return []
  }
}

function writeStorage(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Quota exceeded or storage unavailable -- history just won't persist
    // this time; the app keeps working with in-memory state regardless.
  }
}

/** Load saved history, newest first (that's how it's stored). */
export function loadHistory() {
  return readStorage()
}

/**
 * Record a successful query at the front of history, capped to HISTORY_LIMIT
 * items. Returns the updated list. Only call this for successful results --
 * failed queries are not saved.
 */
export function addHistoryItem({ question, sql, rowCount, columns, rows }) {
  const cacheable = Array.isArray(rows) && rows.length <= MAX_CACHED_ROWS

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    sql: sql ?? null,
    timestamp: new Date().toISOString(),
    rowCount: rowCount ?? null,
    columns: cacheable ? columns : null,
    rows: cacheable ? rows : null,
  }

  const next = [entry, ...readStorage()].slice(0, HISTORY_LIMIT)
  writeStorage(next)
  return next
}

/** Remove all saved history. Returns the (empty) list. */
export function clearHistory() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do if storage isn't available.
  }
  return []
}
