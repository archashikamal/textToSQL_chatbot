# DataSage Frontend

A React + Vite dashboard for the Text-to-SQL backend (`../backend/api.py`). Ask
questions in plain English, see the generated SQL, browse results as a table or chart,
and export them as CSV — all against the `/api/*` endpoints. See the
[root README](../README.md) for the overall project and architecture.

## Stack

- React 19 + Vite
- Tailwind CSS v4 (via `@tailwindcss/postcss`)
- Axios for API calls
- Recharts for the chart view

## Setup

```bash
npm install
cp .env.example .env   # point VITE_API_URL at your backend if not on :8000
npm run dev
```

The backend (`uv run python api.py` in `../backend/`) must be running first —
see [`../backend/README.md`](../backend/README.md).

## Structure

```
src/
├── components/
│   ├── Sidebar.jsx          # App branding, New Query, history, schema explorer, health
│   ├── ChatInterface.jsx    # Message list + input box + empty state
│   ├── Message.jsx          # One question/answer pair (SQL, table/chart tabs, errors)
│   ├── SqlViewer.jsx        # Syntax-highlighted, copyable SQL block
│   ├── ResultTable.jsx      # Scrollable results table
│   ├── ChartView.jsx        # Renders the chart `analyzeChart` decided on (bar or line)
│   ├── SchemaExplorer.jsx   # Collapsible table/column tree with search
│   └── LoadingState.jsx     # Skeleton shown while a query is in flight
├── services/api.js          # Axios wrapper for /api/query, /explain, /schema, /health, /export
├── utils/chartAnalysis.js   # Deterministic chart-shape detection (no LLM call)
├── utils/queryHistory.js    # localStorage-backed query history (no backend, no auth)
├── App.jsx                  # Layout + app state (messages, history, schema, health)
├── main.jsx
└── index.css
```

## Notes

- **Query history** (`utils/queryHistory.js`) lives entirely in this browser's
  `localStorage` — there's no backend history table or auth, per the "first version"
  brief. Only successful queries are saved (question, generated SQL, timestamp, row
  count, and — for small results — the actual columns/rows so clicking a history item
  can restore the previous result instantly instead of re-running the pipeline).
  Capped at 20 items, newest first. "Clear" in the sidebar wipes it. Corrupt or
  unavailable storage (private browsing, quota exceeded) degrades gracefully to an
  empty/in-memory-only history rather than breaking the app. The backend's
  `GET /api/history` endpoint still exists and works (`getHistory()` in `api.js`), but
  the sidebar no longer uses it, since backend history is in-memory and resets on
  restart, while `localStorage` persists across both reloads and backend restarts.
- Schema is fetched once from the backend's `GET /api/schema`.
- **CSV export** (`utils/csv.js`, "Download CSV" button in `Message.jsx`) is generated
  entirely client-side from the columns/rows already displayed — RFC 4180 escaping
  (quotes fields containing a comma/quote/newline, doubles embedded quotes), `null`/
  `undefined` become an empty field, and a UTF-8 BOM is included so Excel doesn't
  mangle accented characters. The backend's `GET /api/export?question=...` still
  exists, but isn't used here: it re-runs the whole RAG/SQL pipeline for that question
  rather than exporting what's on screen, which is both wasteful (another LLM call)
  and not guaranteed to match the displayed result.
- **Chart detection** (`utils/chartAnalysis.js`) runs entirely in the browser on the
  columns/rows `/api/query` already returned — no extra request, no LLM call. It
  classifies each column as numeric / date / text from its values (nulls are ignored,
  not disqualifying) and picks a shape: one text + numeric column(s) → bar chart
  (grouped if several numeric columns); a date column + numeric column(s) → line
  chart; a single row with several numeric columns and nothing to group by (e.g. an
  aggregate like `SELECT AVG(x), MAX(x)`) → a transposed bar comparing them; anything
  else (no numeric columns, multiple ambiguous text columns, empty results) → the
  Chart tab is hidden and only the table is shown. Numeric-typed id/foreign-key
  columns (`id`, `cliente_id`, ...) are excluded from chartable measurements. Large
  result sets are downsampled (evenly spaced, not just truncated) rather than
  rendered in full.
- **Explain SQL** (button in `SqlViewer.jsx`) is fully opt-in — nothing is requested
  from `POST /api/explain` until it's clicked, and the explanation is cached in that
  message's local state, so toggling it open/closed again never re-calls the backend.
- **Loading state** (`LoadingState.jsx`) shows one honest "Running your query…" label,
  not fake staged progress ("Retrieving schema…" / "Generating SQL…" / "Executing
  query…") — `/api/query` is a single request/response with no stage events to report,
  so showing fabricated steps would be misleading. If the backend is ever changed to
  stream real per-stage progress, that's the place to start showing it.
- **Error messages** (`utils/errorMessages.js`) map raw backend/LLM/SQLite error
  strings to a short, friendly summary (e.g. "no such column" → "referenced a column
  or table that doesn't exist"); the original message is always still available behind
  a "Show technical details" toggle in the error banner, so nothing is hidden, just
  led with something readable. Short, already-plain-English messages the backend itself
  crafted (e.g. "Please enter a question.") are shown as-is rather than replaced with a
  generic fallback — only messages that look like a raw technical dump get summarized.
- **Network error handling** (`services/api.js`) distinguishes a timeout ("the server
  may be busy") from a genuinely unreachable backend — Axios sets `.request` in both
  cases, so a naive check would call a slow response "unreachable". Every `/api/*`
  response is also shape-checked (`InvalidResponseError`) before being handed to a
  component, so a malformed or unexpected response body can't crash the UI.
