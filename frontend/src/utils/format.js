/** Format a duration in milliseconds as a short, readable string (e.g. "342 ms", "4.8s"). */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)}s`
}
