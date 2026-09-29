/**
 * Deterministic, frontend-only chart-shape detection for /api/query results.
 * No LLM call is made to decide this -- it's pure inspection of the columns
 * and rows the backend already returned.
 */

export const MAX_SERIES = 4
export const MAX_BAR_CATEGORIES = 25
export const MAX_LINE_POINTS = 150

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?$/
const NUMERIC_RE = /^-?\d+(\.\d+)?$/

/** Turn a raw column name into a readable axis/legend label. */
export function humanize(name) {
  return name
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Classify a column as 'numeric', 'date', 'text', or 'empty' (all-null),
 * purely from the values already returned by the query. Nulls are ignored
 * rather than disqualifying a column, so a numeric column with some missing
 * values is still treated as numeric.
 */
function classifyColumn(rows, column) {
  const values = rows
    .map((row) => row[column])
    .filter((v) => v !== null && v !== undefined && v !== '')

  if (values.length === 0) return 'empty'

  const isNumeric = (v) => typeof v === 'number' || (typeof v === 'string' && NUMERIC_RE.test(v.trim()))
  const isDate = (v) => typeof v === 'string' && DATE_RE.test(v.trim())

  if (values.every(isNumeric)) return 'numeric'
  if (values.every(isDate)) return 'date'
  return 'text'
}

/**
 * Numeric-typed identifier/foreign-key columns (id, cliente_id, customer_id, ...)
 * are measurements in name only -- plotting them as bars is never meaningful.
 * Excluded from `valueCols` unless doing so would leave nothing to chart at all.
 */
function looksLikeIdentifier(column) {
  const name = column.toLowerCase()
  return name === 'id' || name.endsWith('_id')
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Evenly-spaced downsample that preserves overall shape better than truncation. */
function downsample(rows, max) {
  if (rows.length <= max) return rows
  const step = rows.length / max
  const out = []
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)])
  return out
}

/**
 * Decide whether/how `columns`/`rows` can be charted. Returns null when a
 * chart wouldn't be meaningful (caller should show the table only), otherwise
 * a plain description of the chart to render.
 */
export function analyzeChart(columns, rows) {
  if (!columns?.length || !rows?.length) return null

  const kinds = Object.fromEntries(columns.map((c) => [c, classifyColumn(rows, c)]))
  const allNumericCols = columns.filter((c) => kinds[c] === 'numeric')
  const dateCols = columns.filter((c) => kinds[c] === 'date')
  const textCols = columns.filter((c) => kinds[c] === 'text')

  // Prefer excluding numeric-typed identifier columns (id, cliente_id, ...) from
  // the chartable measurements, but fall back to including them if that's all
  // there is -- something chartable beats nothing.
  const measurementCols = allNumericCols.filter((c) => !looksLikeIdentifier(c))
  const numericCols = measurementCols.length > 0 ? measurementCols : allNumericCols

  if (numericCols.length === 0) return null // nothing to plot

  // Rule 2: a date/time column + numeric column(s) -> line chart over time.
  if (dateCols.length >= 1) {
    const labelCol = dateCols[0]
    const valueCols = numericCols.slice(0, MAX_SERIES)
    const sorted = [...rows].sort((a, b) => (a[labelCol] < b[labelCol] ? -1 : a[labelCol] > b[labelCol] ? 1 : 0))
    const sample = downsample(sorted, MAX_LINE_POINTS)
    return {
      kind: 'line',
      labelCol,
      valueCols,
      truncated: sample.length < sorted.length,
      totalCount: sorted.length,
      shownCount: sample.length,
      data: sample.map((row) => ({
        [labelCol]: String(row[labelCol]),
        ...Object.fromEntries(valueCols.map((c) => [c, toNumber(row[c])])),
      })),
    }
  }

  // Rule 1 & 3: one categorical column + one-or-more numeric columns -> bar chart
  // (grouped bars when there's more than one numeric column).
  if (textCols.length === 1 && numericCols.length >= 1) {
    const labelCol = textCols[0]
    const valueCols = numericCols.slice(0, MAX_SERIES)
    const sample = downsample(rows, MAX_BAR_CATEGORIES)
    return {
      kind: 'bar',
      labelCol,
      valueCols,
      truncated: sample.length < rows.length,
      totalCount: rows.length,
      shownCount: sample.length,
      data: sample.map((row) => ({
        [labelCol]: String(row[labelCol]),
        ...Object.fromEntries(valueCols.map((c) => [c, toNumber(row[c])])),
      })),
    }
  }

  // Rule 3 (single-row aggregate): several numeric columns and nothing to group
  // by (e.g. `SELECT COUNT(*), AVG(price), MAX(price) ...`). Transpose so each
  // numeric column becomes its own bar -- comparing the aggregates directly.
  if (rows.length === 1 && numericCols.length > 1) {
    const cols = numericCols.slice(0, MAX_SERIES * 2)
    return {
      kind: 'bar',
      labelCol: 'metric',
      valueCols: ['value'],
      truncated: false,
      totalCount: cols.length,
      shownCount: cols.length,
      data: cols.map((c) => ({ metric: humanize(c), value: toNumber(rows[0][c]) })),
    }
  }

  // Ambiguous shape (e.g. multiple text columns with no clear axis) -- table only.
  return null
}
