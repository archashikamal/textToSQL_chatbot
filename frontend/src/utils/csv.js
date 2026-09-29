/**
 * Client-side CSV generation from already-fetched query results (columns +
 * row objects), so "Download CSV" exports exactly what's on screen -- no
 * network round trip, no re-running the LLM/SQL pipeline. No new dependency:
 * this is plain string building, not a CSV library.
 */

/**
 * Escape a single field per RFC 4180: wrap in double quotes if it contains a
 * comma, a double quote, or a newline, and escape embedded quotes by doubling
 * them. `null`/`undefined` become an empty field, not the text "null".
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'string' ? value : String(value)
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/** Build a CSV string (CRLF line endings) from column names and row objects. */
export function rowsToCsv(columns, rows) {
  const header = columns.map(escapeCsvField).join(',')
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(','))
  return [header, ...lines].join('\r\n')
}

/**
 * Trigger a browser download of `content` as a UTF-8 CSV file. A leading BOM
 * is included so spreadsheet apps (notably Excel on Windows) correctly detect
 * UTF-8 instead of mangling accented characters.
 */
export function downloadCsv(filename, content) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
