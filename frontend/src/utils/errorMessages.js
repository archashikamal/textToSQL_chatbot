/**
 * Turns the raw error strings the backend/LLM/SQLite produce into a short,
 * human-readable summary. The raw message is never discarded -- callers can
 * still show it (e.g. behind a "technical details" toggle) for transparency,
 * this just decides what to lead with.
 */

const RULES = [
  {
    test: /api[_ ]?key.*(not valid|invalid)/i,
    message: "The AI service isn't configured correctly (invalid API key). Please contact the administrator.",
  },
  {
    test: /default credentials were not found|DefaultCredentialsError/i,
    message: "The AI service isn't configured correctly (missing API key). Please contact the administrator.",
  },
  {
    test: /quota|rate.?limit|\b429\b/i,
    message: 'The AI service is temporarily rate-limited. Please wait a moment and try again.',
  },
  {
    test: /sql validation failed/i,
    message: "The generated SQL didn't pass our safety checks, so it wasn't run. Try rephrasing your question.",
  },
  {
    test: /did not return a valid sql|no valid sql/i,
    message:
      "The AI couldn't turn this into a SQL query. Try rephrasing your question — being specific about which data you want often helps.",
  },
  {
    test: /no such column|no such table/i,
    message:
      "The generated SQL referenced a column or table that doesn't exist in the database. Try rephrasing your question to be more specific.",
  },
  {
    test: /sql execution failed/i,
    message: 'There was a problem running the generated SQL against the database. Try rephrasing your question.',
  },
  {
    test: /could not reach the api|network ?error/i,
    message: "Couldn't reach the backend. Make sure it's running, then try again.",
  },
]

const FALLBACK = 'Something went wrong while running your query. Try rephrasing your question, or try again in a moment.'

/**
 * Heuristic for "does this look like a raw technical dump rather than a
 * message meant to be read by an end user" -- long, multi-line, or containing
 * telltale library/stack-trace markers. Used only when no RULE above already
 * matched, to decide whether a short backend-crafted message (e.g. "Please
 * enter a question.", "Could not connect to the database...") should be shown
 * as-is, or replaced with the generic FALLBACK (with the raw text still
 * available behind "technical details").
 */
function looksTechnical(raw) {
  return raw.length > 200 || /\n/.test(raw) || /site-packages|Traceback|quota_metric|googleapis\.com/i.test(raw)
}

/**
 * @param {string} rawError - the raw error string from the API response.
 * @returns {{ message: string, technical: string|null }} a friendly summary,
 *   plus the original message (omitted when it's identical to the summary).
 */
export function humanizeError(rawError) {
  const raw = (rawError || '').trim()
  if (!raw) return { message: FALLBACK, technical: null }

  const rule = RULES.find((r) => r.test.test(raw))
  if (rule) return { message: rule.message, technical: raw !== rule.message ? raw : null }

  if (!looksTechnical(raw)) return { message: raw, technical: null }

  return { message: FALLBACK, technical: raw }
}
