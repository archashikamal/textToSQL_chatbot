import axios from 'axios'

// Backend base URL. No API keys live here or anywhere in the frontend -- the LLM key
// stays server-side in the FastAPI backend's .env.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
})

/**
 * Extract a readable message from any Axios/network failure so callers never
 * have to deal with raw error objects.
 */
function toErrorMessage(error) {
  // Checked before `error.request` below: a timed-out request also has
  // `.request` set (it was sent, just never answered in time), so without
  // this it would be misreported as "backend unreachable" instead of "slow".
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return 'The request took too long to complete. The server may be busy — please try again.'
  }
  if (error.response) {
    const detail = error.response.data?.detail || error.response.data?.error
    return detail || `Request failed with status ${error.response.status}`
  }
  if (error.request) {
    return `Could not reach the API at ${BASE_URL}. Is the backend running?`
  }
  return error.message || 'Unknown error'
}

/** A response body missing the fields every /api/* JSON endpoint always includes. */
class InvalidResponseError extends Error {
  constructor() {
    super('Received an unexpected response from the server.')
  }
}

/** POST /api/query — run the RAG -> SQL -> validation -> execution pipeline. */
export async function queryDatabase(question) {
  try {
    const { data } = await client.post('/api/query', { question })
    if (!data || typeof data.success !== 'boolean') throw new InvalidResponseError()
    return data
  } catch (error) {
    // Normalize network/timeout failures into the same shape /api/query itself
    // returns for pipeline errors, so callers only ever handle one error shape.
    return {
      success: false,
      question,
      sql: null,
      columns: null,
      rows: null,
      row_count: null,
      execution_time_ms: null,
      error: toErrorMessage(error),
    }
  }
}

/**
 * POST /api/explain — ask the backend for a short, human-readable explanation of
 * an already-generated SQL query. Only ever called when the user clicks
 * "Explain SQL" — never automatically after a query.
 */
export async function explainSql(sql, question) {
  try {
    const { data } = await client.post('/api/explain', { sql, question })
    if (!data || typeof data.success !== 'boolean') throw new InvalidResponseError()
    return data
  } catch (error) {
    return { success: false, explanation: null, error: toErrorMessage(error) }
  }
}

/**
 * GET a JSON endpoint, converting any Axios/network failure into an Error whose
 * `.message` is already the friendly, human-readable text (via toErrorMessage) --
 * so callers' own try/catch (e.g. App.jsx's refreshSchema) don't need to know
 * about Axios error shapes to show something readable.
 */
async function getJson(path) {
  try {
    const { data } = await client.get(path)
    return data
  } catch (error) {
    throw new Error(toErrorMessage(error))
  }
}

/** GET /api/schema — tables + columns for the sidebar schema explorer. */
export async function getSchema() {
  const data = await getJson('/api/schema')
  if (!data || !Array.isArray(data.tables)) throw new InvalidResponseError()
  return data.tables
}

/** GET /api/health — backend/database/vector-store health status. */
export async function getHealth() {
  const data = await getJson('/api/health')
  if (!data || typeof data.status !== 'string') throw new InvalidResponseError()
  return data
}

/** GET /api/history — recent queries recorded by the backend (most recent first). */
export async function getHistory() {
  const data = await getJson('/api/history')
  if (!data || !Array.isArray(data.items)) throw new InvalidResponseError()
  return data.items
}

// Note: the backend also exposes GET /api/export?question=..., but it re-runs
// the whole RAG/SQL pipeline for that question rather than exporting the
// result already on screen -- unreliable for "download what I'm looking at"
// (another LLM call, could in principle return different rows, fails if the
// backend/LLM is unreachable). CSV export is generated client-side instead,
// straight from the already-fetched result -- see utils/csv.js and the
// "Download CSV" button in components/Message.jsx.

export { BASE_URL }
