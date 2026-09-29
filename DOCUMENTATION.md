# Project Documentation — Text-to-SQL Chatbot with RAG

A complete technical reference for this project: what it is, how every part works, every
file's purpose, the full API contract, environment variables, error handling, the data
it ships with, how it evolved, and its known limitations.

This is the deep-dive reference. For "how do I get this running", see the shorter,
task-focused [`README.md`](README.md), [`backend/README.md`](backend/README.md), and
[`frontend/README.md`](frontend/README.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [The Sample Data](#5-the-sample-data)
6. [The RAG Pipeline, Step by Step](#6-the-rag-pipeline-step-by-step)
7. [Backend — File by File](#7-backend--file-by-file)
8. [Frontend — File by File](#8-frontend--file-by-file)
9. [API Reference](#9-api-reference)
10. [Environment Variables](#10-environment-variables)
11. [Setup & Running](#11-setup--running)
12. [Error Handling Architecture](#12-error-handling-architecture)
13. [Security](#13-security)
14. [Testing & Verification Approach](#14-testing--verification-approach)
15. [Project History](#15-project-history)
16. [Known Limitations](#16-known-limitations)
17. [Possible Future Improvements](#17-possible-future-improvements)

---

## 1. Overview

This project answers natural-language questions about a SQLite database by:

1. Retrieving relevant context from the database (via a RAG pipeline over an embedded
   index of the database's own rows)
2. Asking an LLM (Google Gemini) to write a single read-only SQL `SELECT` statement
3. Validating that SQL (statement type, allowed tables) before ever running it
4. Executing it against SQLite with a row limit
5. Returning the question, the SQL, the results, and timing — plus, on request, a
   plain-English explanation of what the SQL does

It ships with two front ends to that pipeline:

- A **FastAPI backend** (`/api/*` JSON API) — the only one still actively used
- ~~A Streamlit UI~~ — the original frontend, fully replaced and removed once the React
  app reached feature parity (see [§15 Project History](#15-project-history))

And the current, actively-developed frontend:

- A **React + Vite dashboard** — chat-style question input, syntax-highlighted SQL,
  a results table, auto-detected charts, a schema explorer, browser-local query history,
  CSV export, and an "Explain SQL" feature

## 2. Architecture

```text
React + Vite (frontend/, :5173)
    │  chat UI, SQL viewer, table/chart, schema explorer,
    │  history (localStorage), CSV export, "Explain SQL"
    │
    │  HTTP (/api/*, JSON)
    ▼
FastAPI (backend/api.py, :8000)
    │
    ▼
query_service.run_pipeline(question)
    │
    ├─ 1. retriever_node.py    -- embed the question, similarity-search Chroma,
    │                             rerank with a CrossEncoder
    ├─ 2. sql_node.py          -- build a prompt from the retrieved context,
    │                             ask Gemini for SQL, clean up its output
    ├─ 3. sql_validator.py     -- parse the SQL (sqlglot), reject anything that
    │                             isn't a single SELECT against a known table
    └─ 4. sql_executor.py      -- run it read-only against SQLite, capped at
                                   1000 rows

(sql_explainer.py sits beside this pipeline, not inside it -- it's a separate,
 opt-in Gemini call that turns already-generated SQL back into plain English,
 used only by POST /api/explain.)
```

**Design principle used throughout**: `/api/query` and `/api/explain` always respond
with HTTP `200` and a `{success, ..., error}` body for *pipeline-level* failures (bad
SQL, LLM errors, quota limits, etc.) — the frontend only ever has to check one field,
never branch on HTTP status *and* a body shape. Genuinely malformed *requests* (missing
fields, unparseable JSON) still get FastAPI's normal `422`. See
[§12 Error Handling](#12-error-handling-architecture) for the full picture.

## 3. Tech Stack

**Backend**
| Layer | Choice |
|---|---|
| Web framework | FastAPI + Uvicorn |
| LLM | Google Gemini, via `langchain-google-genai` (model configurable, see [§10](#10-environment-variables)) |
| Vector store | ChromaDB, via `langchain-chroma` |
| Embeddings | HuggingFace `sentence-transformers` (multilingual MiniLM) |
| Reranking | `sentence-transformers` `CrossEncoder` (ms-marco MiniLM) |
| SQL parsing/validation | `sqlglot` |
| Database | SQLite (stdlib `sqlite3`, opened read-only) |
| Package manager | `uv` |

**Frontend**
| Layer | Choice |
|---|---|
| Framework | React 19 + Vite |
| Styling | Tailwind CSS v4 |
| HTTP client | Axios |
| Charts | Recharts |
| Fonts | Inter (UI), JetBrains Mono (code), via Google Fonts |

No frontend state-management library, no CSS framework component kit, no test
framework — deliberately minimal, per the project's own "don't introduce unnecessary
dependencies" guidance (see [§15](#15-project-history) and every frontend `README.md`
note on why a given library was or wasn't added).

## 4. Repository Structure

```text
text-to-sql-chatbot-with-rag/
├── README.md                  # quick start, architecture overview
├── DOCUMENTATION.md            # this file -- full technical reference
├── LICENSE
├── backend/                    # FastAPI + RAG pipeline (self-contained Python project)
│   ├── api.py                   # FastAPI app: all /api/* routes
│   ├── query_service.py         # orchestrates the 4-step pipeline
│   ├── retriever_node.py        # RAG retrieval + rerank
│   ├── sql_node.py               # SQL generation (Gemini)
│   ├── sql_validator.py          # SQL safety validation (sqlglot)
│   ├── sql_executor.py           # read-only SQLite execution
│   ├── sql_explainer.py          # "Explain SQL" (separate Gemini call)
│   ├── schema_service.py         # schema introspection for /api/schema, /api/health
│   ├── ingest_pipeline.py        # indexes DB rows into the Chroma vector store
│   ├── scripts/create_xpto_db.py # generates the sample "XPTO" database
│   ├── pyproject.toml, uv.lock, .python-version
│   ├── .env-example
│   ├── README.md
│   └── data/                     # generated: SQLite DB + Chroma store (gitignored)
└── frontend/                   # React + Vite dashboard (self-contained Node project)
    ├── src/
    │   ├── App.jsx                    # layout + top-level state
    │   ├── main.jsx                   # React entry point
    │   ├── index.css                  # Tailwind import + theme tokens
    │   ├── components/
    │   │   ├── Sidebar.jsx             # branding, New Query, history, schema, health
    │   │   ├── ChatInterface.jsx       # message list, input box, empty state
    │   │   ├── Message.jsx             # one Q&A turn: SQL, table/chart, errors, export
    │   │   ├── SqlViewer.jsx           # syntax-highlighted SQL + Copy + Explain SQL
    │   │   ├── ResultTable.jsx         # results table (numeric columns right-aligned)
    │   │   ├── ChartView.jsx           # renders the chart chartAnalysis.js decided on
    │   │   ├── SchemaExplorer.jsx      # collapsible table/column tree, searchable
    │   │   └── LoadingState.jsx        # single honest "Running your query…" skeleton
    │   ├── services/api.js             # Axios wrapper for every /api/* endpoint
    │   └── utils/
    │       ├── chartAnalysis.js         # deterministic chart-shape detection
    │       ├── csv.js                    # client-side RFC 4180 CSV generation
    │       ├── errorMessages.js          # raw error string -> friendly summary
    │       ├── format.js                  # duration formatting (ms / s)
    │       └── queryHistory.js            # localStorage-backed history
    ├── package.json, index.html, vite.config.js, postcss.config.js
    ├── .env.example
    └── README.md
```

## 5. The Sample Data

The project ships with a small, fictional dataset — a made-up Brazilian company
"XPTO" — generated by `backend/scripts/create_xpto_db.py`. Column names and text data
are in Portuguese; you can ask questions in English or Portuguese, since the LLM
translates.

| Table | Rows | Contents |
|---|---|---|
| `funcionarios` | 10 | Employees — name, role, department, salary, hire date, supervisor |
| `departamentos` | 6 | Departments — name, budget, manager, location |
| `clientes` | 5 | Clients — name, city/state, person vs. company, credit limit |
| `vendas` | 3 | Sales orders — client, employee, dates, amounts, status |
| `produtos` | 5 | Products/services — SKU, price, cost, stock levels |
| `itens_venda` | 3 | Line items linking sales to products |
| `fornecedores` | 3 | Suppliers |
| `projetos` | 3 | Projects — client, manager, budget, status |
| `table_comments`, `column_comments` | — | Human-written descriptions of every table/column. Present in the DB, but **not** actually used by the RAG pipeline — a known piece of leftover design (see [§16](#16-known-limitations)). |

To point the app at your own data instead: set `DATABASE_PATH` to your SQLite file and
re-run `ingest_pipeline.py` to index it.

## 6. The RAG Pipeline, Step by Step

This is what happens, in order, inside `query_service.run_pipeline(question)` for every
`POST /api/query` call:

1. **Guard**: if `question` is empty/whitespace-only, return an error immediately —
   *before* touching retrieval or the LLM (saves a wasted call; the free-tier Gemini
   quota is only 20 requests/day).
2. **Retrieve** (`retriever_node.py`): embed the question with a HuggingFace
   sentence-transformer, run a similarity search against the Chroma vector store
   (`TOP_K × 3` candidates), then rerank those candidates with a CrossEncoder and keep
   the top `TOP_K` (default 5). Each candidate is a plain-text rendering of one database
   row (`"Table: X\ncol: val\n..."`), produced ahead of time by `ingest_pipeline.py`.
3. **Generate SQL** (`sql_node.py`): build a prompt from the retrieved row-context and
   the question, send it to Gemini, then clean the response — strip markdown code
   fences, extract from the first `SELECT` onward, handle both plain-string and
   list-of-typed-blocks response shapes (newer Gemini versions return the latter).
4. **Validate** (`sql_validator.py`): reject if it contains a semicolon, a disallowed
   keyword (`DROP`, `INSERT`, `PRAGMA`, ...), fails to parse as SQL, isn't a `SELECT`,
   or references any table not in the database's own `sqlite_master`.
5. **Execute** (`sql_executor.py`): open SQLite read-only (`?mode=ro`), append a
   `LIMIT 1000` if the query doesn't already have one, run it, fetch results.
6. **Return**: `{success, question, sql, columns, rows, row_count, execution_time_ms,
   error}`. A failure at any step returns `success: false` with a specific `error`
   message (see [§12](#12-error-handling-architecture)) — later steps are never reached.

`POST /api/explain` is a separate, single-step process: it re-validates the given SQL
with the same validator (so it can't be tricked into "explaining" something malicious),
then makes one Gemini call with a prompt asking for a 2-3 sentence plain-English summary.
It shares the LLM *configuration* (model, key, temperature) with `sql_node.py` but uses
its own model instance — completely decoupled from SQL generation.

## 7. Backend — File by File

### `api.py` (268 lines)
The FastAPI application. Defines every `/api/*` route (see [§9](#9-api-reference) for
the full contract), the CORS middleware, and the in-memory query-history deque. Every
route catches its own failure modes and returns a structured, predictable body — no
route can leak a raw stack trace to the client (see [§12](#12-error-handling-architecture)).

### `query_service.py` (92 lines)
`run_pipeline(question) -> dict` — orchestrates the four pipeline steps above, times
the whole thing, and turns every failure mode into a structured `{success: False, ...}`
dict with a specific, human-readable `error` message rather than raising. Also defines
`ALLOWED_TABLES`, computed once at import time from the live database's own
`sqlite_master` (via `sql_validator.allowed_tables_from_db`) — this is what
`sql_validator.validate_sql()` checks generated SQL against, and what `/api/explain`
reuses to validate its input.

### `retriever_node.py` (105 lines)
Loads the HuggingFace embedding model and the Chroma vector store at import time,
builds a `VectorStoreRetriever`, and loads the CrossEncoder rerank model.
`retriever_node(state)` embeds `state["question"]`, retrieves `TOP_K × 3` candidates,
reranks them down to `TOP_K`, and stores the resulting page-content strings into
`state["retrieved_docs"]`. Wraps the whole thing in a `try/except` that logs the full
traceback server-side and raises a clean `RuntimeError` with a safe summary — added
after a failure-mode audit found this path had no error handling of its own.

### `sql_node.py` (88 lines)
Instantiates the Gemini chat model (`max_retries=2, timeout=30` — deliberately bounded,
see [§12](#12-error-handling-architecture)) and the SQL-generation prompt template.
`sql_generator_node(state)` formats the prompt with the retrieved context + question,
calls the LLM, and cleans the response: extracts plain text whether `content` is a
string or a list of typed blocks (a compatibility fix for newer Gemini versions), strips
markdown fences, extracts from the first `SELECT` onward, strips a trailing semicolon.
Falls back to an empty string (handled upstream as "the model didn't return valid SQL")
if no `SELECT` is found anywhere in the output.

### `sql_validator.py` (51 lines)
`validate_sql(sql, allowed_tables) -> (bool, reason)`:
- Rejects any `;` (blocks multi-statement injection)
- Rejects a fixed disallowed-keyword list (`insert`, `update`, `delete`, `drop`, `alter`,
  `create`, `replace`, `attach`, `detach`, `truncate`, `pragma`, `vacuum`, `merge`)
- Parses with `sqlglot` (SQLite dialect); rejects unparseable SQL or anything whose
  top-level statement type isn't `select`
- Extracts every table name referenced (via `sqlglot`'s AST) and rejects if any isn't in
  `allowed_tables`

`allowed_tables_from_db(sqlite_path)` reads the live table list straight from
`sqlite_master` — this is what makes the allowed-tables check accurate even if the
schema changes without redeploying.

### `sql_executor.py` (29 lines)
`execute_sql(sql, row_limit=1000, timeout=5.0)`: opens a read-only SQLite connection
(`file:...?mode=ro`), sets a 5-second busy timeout (so a locked database fails fast
instead of hanging), appends `LIMIT 1000` if the query doesn't already specify one, and
returns `(columns, rows)`.

### `sql_explainer.py` (68 lines)
The "Explain SQL" feature. `explain_sql(question, sql) -> str`: formats a short prompt
asking for a 2-3 sentence plain-English explanation, calls its own Gemini instance
(same model/key/temperature config as `sql_node.py`, but a fully separate object so
nothing here can affect SQL generation), and extracts the text the same way `sql_node.py`
does (shared logic for the string-vs-list-of-blocks response shape).

### `schema_service.py` (55 lines)
`get_schema(sqlite_path)`: reads every user table from `sqlite_master` and every
column's name/type/nullable/primary-key from `PRAGMA table_info` — powers
`GET /api/schema`. Deliberately reads SQLite's own catalog rather than the app's
`table_comments`/`column_comments` metadata tables, so it's always accurate even if
those are stale. `check_database(sqlite_path)`: confirms the configured DB file exists
and opens — powers `GET /api/health`.

### `ingest_pipeline.py` (83 lines)
A one-time (or re-run-as-needed) script, *not* part of the request pipeline. For every
table in the configured database, reads all rows (`PRAGMA table_xinfo` + `SELECT *`),
renders each as a `"Table: X\ncol: val\n..."` text chunk, and upserts it into the Chroma
vector store (one embedding per row, id = `table:primary_key`). Re-embeds every row on
every run — no incremental/delta indexing (see [§16](#16-known-limitations)).

### `scripts/create_xpto_db.py`
Generates the sample database described in [§5](#5-the-sample-data): creates the
metadata tables, the 8 business tables, inserts the comment/description rows, then
inserts the sample data. Run once to bootstrap `backend/data/xpto_empresa.db`.

## 8. Frontend — File by File

### `App.jsx` (174 lines)
Top-level layout and state. Owns: the message list (the conversation), the
`localStorage`-backed history list, the schema list, health status, and whether the
mobile sidebar drawer is open. `handleAsk(question)` pushes a loading message, calls
`queryDatabase()`, replaces it with the result, and (only on success) saves it to
history. `handleSelectHistory(item)` restores a cached result instantly if the history
entry has one, otherwise re-asks the question. Polls `/api/health` every 30s.

### `components/Sidebar.jsx` (159 lines)
Dark-themed sidebar: branding, "New Query" button, the "Recent Queries" list (each item
shows a green dot if its result is cached for instant restore, gray if it'll re-ask),
a "Clear" action, the `SchemaExplorer`, and a health badge at the bottom. Becomes an
off-canvas drawer with a backdrop below the `md` breakpoint.

### `components/ChatInterface.jsx` (133 lines)
The message list (auto-scrolls to bottom on new messages) plus the input box (Enter to
submit, Shift+Enter for a newline, Ask button disabled while a query is in flight) and
the empty state (four clickable example questions: "Show total sales", "Show top 10
products", "Show sales by month", "Count customers by region").

### `components/Message.jsx` (193 lines)
One question/answer turn. Renders the user's question bubble, then either the
`LoadingState` skeleton or the `AssistantResult`: the SQL viewer, a Table/Chart toggle
(only shown when `chartAnalysis.js` finds the result chartable), the `DownloadCsvButton`
(disabled when there are no rows), the table or chart itself, and a footer with row
count + execution time. On failure, renders the `ErrorBanner` — a friendly summary from
`errorMessages.js` with a "Show technical details" toggle for the raw message.

### `components/SqlViewer.jsx` (145 lines)
A small hand-written SQL keyword/string/number tokenizer for syntax highlighting (not a
full grammar). Copy-to-clipboard button. The "Explain SQL" button/panel: fully opt-in —
nothing is requested from `POST /api/explain` until clicked; once loaded, toggling the
panel open/closed again never re-calls the backend (the `useExplain` hook tracks
idle/loading/loaded/error state locally).

### `components/ResultTable.jsx` (90 lines)
The results table: sticky header, hover row highlight, `null` shown as muted italic
text. Columns where every non-null value is numeric are automatically right-aligned
with tabular figures (a table-readability convention, computed purely from already-
rendered data — presentation only). Has its own "No results found" empty state with
actionable copy.

### `components/ChartView.jsx` (102 lines)
Pure rendering component — takes the chart description `chartAnalysis.js` already
computed and draws it with Recharts (`Bar` or `Line`), with readable rotated axis
labels for many categories, a compact-notation Y axis, and a full-precision tooltip.
Does no detection itself, so the same analysis result can be reused elsewhere (e.g. to
decide whether to show the Chart tab at all) without recomputing it.

### `components/SchemaExplorer.jsx` (139 lines)
A collapsible tree of every table and its columns, rendered with real `├─`/`└─` branch
glyphs. A search box filters by table or column name and force-expands matches. Each
table's own column list has an independent scroll cap (`max-h-40`) so one wide table
(some have 15-16 columns) can't push everything else out of view.

### `components/LoadingState.jsx` (30 lines)
Deliberately a single, honest state ("Running your query…" + a spinner + a pulsing
skeleton) — not fake staged progress ("Retrieving schema…" / "Generating SQL…" /
"Executing query…"), because `/api/query` is one request/response with no real
stage-by-stage events to report. Documented in the code as the place to add real
staged progress if the backend is ever changed to stream it.

### `services/api.js` (121 lines)
The only file that talks to the backend. One function per endpoint
(`queryDatabase`, `explainSql`, `getSchema`, `getHealth`, `getHistory`), plus
`toErrorMessage()` (normalizes any Axios/network failure into a readable string,
distinguishing a timeout from a genuinely unreachable backend — both look identical at
the Axios error-shape level otherwise) and `InvalidResponseError` (every response is
shape-checked before being handed to a component, so a malformed/unexpected body can't
crash the UI). `exportCsv()` was deliberately **not** kept here — see
`utils/csv.js` below for why.

### `utils/chartAnalysis.js` (147 lines)
`analyzeChart(columns, rows)` — the deterministic chart-shape decision, run entirely in
the browser on data `/api/query` already returned (no extra request, no LLM call).
Classifies each column as numeric/date/text from its values (nulls ignored, not
disqualifying). Decision rules, in order:
1. A date column + numeric column(s) → **line chart**, sorted by date, downsampled
   (evenly spaced, not truncated) if there are more than 150 points
2. One text column + numeric column(s) → **bar chart**, grouped bars if multiple numeric
   columns, downsampled to 25 categories if more
3. A single row with multiple numeric columns and nothing to group by (e.g.
   `SELECT AVG(x), MAX(x)`) → a **transposed bar chart** comparing the metrics directly
4. Anything else (no numeric columns, multiple ambiguous text columns, empty results) →
   `null` — the caller hides the Chart tab entirely

Numeric-typed identifier columns (`id`, `cliente_id`, ...) are excluded from chartable
measurements (a real bug caught during testing: an `id` column was getting swept into
bar series next to real measurements like salary).

### `utils/csv.js` (41 lines)
`rowsToCsv(columns, rows)`: RFC 4180 escaping (quotes any field containing a comma,
quote, or newline; doubles embedded quotes; `null`/`undefined` become an empty field,
not the text `"null"`). `downloadCsv(filename, content)`: triggers the browser download
with a UTF-8 BOM prefix so Excel doesn't mangle accented characters (this dataset is
full of them). Generated entirely client-side from what's already displayed — the
backend's `GET /api/export` exists but is deliberately unused here, because it re-runs
the whole pipeline (another LLM call) rather than exporting what's on screen.

### `utils/errorMessages.js` (75 lines)
`humanizeError(rawError)`: a small rule list mapping known raw error substrings (invalid
API key, quota exceeded, SQL validation failure, "no such column/table", network
unreachable) to a short, friendly summary, with the raw text preserved for an optional
"technical details" toggle. Messages that don't match any rule but also don't *look*
technical (short, single-line, no stack-trace/library markers) are shown as-is — this
matters because the backend itself now crafts some already-friendly messages ("Please
enter a question.") that shouldn't be replaced by a generic fallback.

### `utils/format.js` (6 lines)
`formatDuration(ms)`: `342 ms` under a second, `4.8s` above.

### `utils/queryHistory.js` (77 lines)
The entire query-history feature — no backend database, no auth, per the "first
version" brief. `addHistoryItem()` prepends a new entry (question, SQL, timestamp, row
count, and — only if the result is ≤200 rows — the actual columns/rows, so a click can
restore instantly) and caps the list at 20. All reads/writes are wrapped in `try/catch`
so a disabled/quota-exceeded/private-browsing `localStorage` degrades to an empty
history rather than breaking the app.

## 9. API Reference

Base URL: `http://127.0.0.1:8000` (default). Interactive docs at `/docs` once running.

### `GET /`
Plain root/info endpoint. `{"message": "Text-to-SQL API", "docs": "/docs"}`.

### `POST /api/query`
**Request**: `{"question": "How many employees are there?"}`

**Response** (always `200`):
```json
{
  "success": true,
  "question": "How many employees are there?",
  "sql": "SELECT COUNT(*) AS total FROM funcionarios",
  "columns": ["total"],
  "rows": [{"total": 10}],
  "row_count": 1,
  "execution_time_ms": 842.13,
  "error": null
}
```
On any pipeline failure, `success: false` and `error` is a specific message (see
[§12](#12-error-handling-architecture)); `sql`/`columns`/`rows`/`row_count` are `null`.

### `POST /api/explain`
**Request**: `{"sql": "SELECT ...", "question": "..."}`
**Response**: `{"success": true, "explanation": "This query...", "error": null}`, or
`success: false` with a reason if the SQL doesn't pass `validate_sql()` or the LLM call
fails. Never called automatically — only when the user clicks "Explain SQL".

### `GET /api/schema`
```json
{
  "tables": [
    {
      "table": "funcionarios",
      "columns": [
        {"name": "id", "type": "INTEGER", "nullable": true, "primary_key": true},
        {"name": "nome", "type": "TEXT", "nullable": false, "primary_key": false}
      ]
    }
  ]
}
```

### `GET /api/health`
```json
{
  "status": "ok",
  "database_connected": true,
  "database_path": "data/xpto_empresa.db",
  "database_error": null,
  "vector_store_ready": true,
  "vector_store_dir": "data/vector_store"
}
```
`status` is `"degraded"` if either the database or vector store isn't reachable. Never
calls the LLM, so it stays fast and cheap to poll.

### `GET /api/history`
```json
{"items": [{"timestamp": "...", "question": "...", "sql": "...", "success": true, "row_count": 1, "execution_time_ms": 842.13, "error": null}]}
```
Last 50 queries made through `/api/query`, newest first. **In-memory only** on the
backend — resets on restart. The frontend doesn't use this; it keeps its own
`localStorage` history instead (see `utils/queryHistory.js` above).

### `GET /api/export?question=...`
Re-runs the pipeline for `question` and streams the result as `text/csv`. Returns `400`
with `{"detail": "..."}` if the pipeline fails, `500` for unexpected errors. (The
frontend generates CSVs client-side instead — see `utils/csv.js` above — this endpoint
exists as a standalone API capability, not because the UI calls it.)

## 10. Environment Variables

### Backend (`backend/.env`, copied from `backend/.env-example`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_PATH` | Path to the SQLite database | `data/xpto_empresa.db` |
| `VECTOR_COLLECTION` | Chroma collection name | `xpto_database_embeddings` |
| `VECTOR_STORE_DIR` | Where Chroma persists its vector store | `data/vector_store` |
| `TOP_K` | Reranked documents kept for the LLM prompt | `5` |
| `EMBED_MODEL` | HuggingFace embedding model | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |
| `RERANK_MODEL` | CrossEncoder rerank model | `cross-encoder/ms-marco-MiniLM-L-6-v2` |
| `LLM_MODEL` | Gemini model name | `gemini-3.8-flash` (see model note below) |
| `LLM_API_KEY` | **Real** Google AI API key | Get one at https://aistudio.google.com/apikey |
| `LLM_TEMPERATURE` | Present but currently unused — `sql_node.py` hardcodes `temperature=0` | `0` |
| `ANONYMIZED_TELEMETRY` | Disables ChromaDB telemetry | `False` |
| `FRONTEND_ORIGINS` | Optional, comma-separated CORS allowlist | Defaults to Vite/CRA localhost origins if unset |

**Model availability note**: `gemini-2.0-flash` and `gemini-2.5-flash` (older defaults)
are no longer available to newly-created API keys as of this writing — confirmed live,
Google's API returns a `404` pointing to `gemini-3.8-flash`, which is what's currently
configured and confirmed working. If your key gets a different error, check
`GET https://generativelanguage.googleapis.com/v1beta/models?key=<your key>` for what
it actually has access to.

**Quota note**: the Gemini free tier is **20 requests/day**, shared across `/api/query`
and `/api/explain`. This was hit repeatedly during this project's own testing — it
surfaces as a `429 ... quota exceeded` error, not a bug.

### Frontend (`frontend/.env`, copied from `frontend/.env.example`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL. Defaults to `http://127.0.0.1:8000` if unset. |

## 11. Setup & Running

```bash
# Backend
cd backend
uv sync
cp .env-example .env                        # then set a real LLM_API_KEY
uv run python scripts/create_xpto_db.py      # creates the sample database
uv run python ingest_pipeline.py             # indexes it into the vector store
uv run python api.py                         # http://127.0.0.1:8000

# Frontend (second terminal, from the repo root)
cd frontend
npm install
cp .env.example .env
npm run dev                                  # http://localhost:5173
```

On Windows, set `PYTHONIOENCODING=utf-8` before running `create_xpto_db.py` — its log
output uses emoji characters that crash on the default cp1252 console codepage. See
`backend/README.md` for the exact commands per shell.

## 12. Error Handling Architecture

A systematic audit was performed across every failure mode (missing/invalid API key,
LLM failure, RAG retrieval failure, invalid/unvalidated SQL, database connection
failure, execution failure, empty input, malformed requests, and their frontend-side
counterparts — unreachable backend, timeout, invalid response shape). Every fix below
was reproduced live (a real exhausted quota, a real invalid key, a forced retriever
failure) before being made, not guessed.

**Fixed:**
- Empty/whitespace questions used to reach the LLM before failing (wasted quota) — now
  rejected before retrieval even starts.
- A non-retryable LLM failure (invalid key, quota exceeded) used to take 30-90+ seconds
  to surface, because the client's defaults (6 retries, no timeout) retried regardless
  of whether the error was retryable — now bounded to `max_retries=2, timeout=30`
  (successful calls unaffected). This mattered doubly for the frontend: the old delay
  could exceed Axios's own 60s timeout, making a *reachable* backend look unreachable.
- A database-connection problem (wrong path, missing file) used to be reported
  identically to a bad-SQL execution problem — now distinguished, so debugging effort
  goes to the right place.
- RAG retrieval/rerank failures had no handling of their own (didn't crash, but surfaced
  whatever raw message the underlying library happened to raise) — now caught, logged
  in full server-side, and re-raised as a clear, safe summary.
- Frontend network errors didn't distinguish a timeout from a genuinely unreachable
  backend (Axios sets `.request` in both cases) — fixed. Every API response is also
  shape-validated before being handed to a component.
- The frontend's error-humanization fallback would have overridden the backend's own
  new friendly messages ("Please enter a question.") with a generic banner — fixed so
  short, plain-English backend messages are shown as-is.

**Confirmed already sufficient** (not assumed): malformed requests return a clean `422`
with no stack trace; every unhandled exception is logged server-side with a full
traceback while only a short message ever reaches the response body; no error message
anywhere echoes back the API key.

## 13. Security

- **SQL injection protection**: only `SELECT` statements are allowed; rejected via both
  a keyword blocklist and by parsing the statement type with `sqlglot`
- **Table allowlisting**: every table referenced in generated SQL must exist in the
  live database's own `sqlite_master` — checked via the AST, not string matching
- **Read-only execution**: the database connection itself is opened in SQLite's
  read-only URI mode (`?mode=ro`), independent of the SQL-level checks above
- **Row limit**: every query gets a `LIMIT 1000` if it doesn't already specify one
- **CORS allowlist**: explicit origins only (Vite/CRA localhost defaults, or
  `FRONTEND_ORIGINS`) — confirmed to reject arbitrary untrusted origins, not a wildcard
- **No secrets in error messages**: verified that no code path formats `LLM_API_KEY`
  into a response, and that Gemini's own provider errors don't echo the key back either

## 14. Testing & Verification Approach

There is no automated test suite. Every claim in this project's development was instead
verified live, against the real running stack, rather than assumed:
- Direct unit-style calls to `sql_validator.validate_sql()` and `sql_executor.execute_sql()`
- `fastapi.testclient.TestClient` round-trips through the real FastAPI app, with the LLM
  call monkeypatched only when the real Gemini quota was exhausted (which happened
  repeatedly during development — the free tier's 20/day limit is small)
- Real end-to-end queries with a real Gemini key and a real SQLite database, for the
  success path
- Deliberate failure injection (forcing the retriever to raise, pointing `DATABASE_PATH`
  at a missing file, sending malformed JSON, empty questions, disallowed SQL) to
  confirm error handling, not just the happy path
- `oxlint` + `vite build` on every frontend change
- Node scripts exercising the frontend's pure utility functions (`chartAnalysis.js`,
  `csv.js`, `errorMessages.js`, `queryHistory.js`) directly, including with mocked
  `localStorage` and mocked DOM primitives, since no browser is available in this
  project's own development environment

## 15. Project History

The project went through several phases, each verified before moving to the next:

1. **Original state**: a Streamlit UI (`ui.py`) + a single legacy `/query` FastAPI
   endpoint, sharing one RAG pipeline.
2. **React frontend built** incrementally: the `/api/*` contract, then schema explorer,
   result visualization/charts, richer query history, SQL explanation, CSV export
   improvements, a UI/UX polish pass, and a full error-handling audit — each shipped and
   verified against the real backend before the next began.
3. **Streamlit removed**: once a feature-by-feature parity check confirmed the React
   app covered (and in several cases exceeded) everything Streamlit did, `ui.py` and the
   legacy `/query` endpoint were deleted, along with the now-unused `streamlit`,
   `pandas`, and `requests` dependencies. (One interesting find during the parity
   check: Streamlit's own query-history "click to restore" button appears to have had a
   latent bug — it set session state that the input box never actually read back. The
   React equivalent was verified to genuinely work.)
4. **Dependency audit**: a further pass found `langchain`, `langchain-community`, and
   `torchvision` were listed as direct dependencies but never imported anywhere and not
   required transitively either — removing them dropped 26 packages from the resolved
   tree.
5. **Repository restructured**: backend files (originally at the repo root) moved into
   a dedicated `backend/` folder alongside `frontend/`, for a clean two-package layout
   suitable for a public repo. Re-verified with a fresh `uv sync` and a full endpoint
   sweep from the new location afterward.

## 16. Known Limitations

- **Gemini free-tier quota**: 20 requests/day, shared across `/api/query` and
  `/api/explain`. Was exhausted repeatedly during this project's own development and
  testing.
- **`GET /api/history` is in-memory** on the backend and resets on restart — not a
  problem in practice since the frontend uses its own `localStorage` history instead,
  but worth knowing if you build another client against this endpoint expecting
  persistence.
- **No incremental ingestion**: `ingest_pipeline.py` re-embeds every row in every table
  on every run. Fine for this project's small sample dataset; would need delta/upsert
  logic for a large, frequently-changing real database.
- **`table_comments`/`column_comments`** metadata tables exist in the sample database
  (with genuinely useful human-written descriptions) but are never read by the RAG
  pipeline — the retrieval step only ever indexes row *data*, not schema documentation.
  Wiring these in could plausibly improve retrieval quality for schema-related
  questions.
- **No automated test suite** — see [§14](#14-testing--verification-approach) for how
  correctness was verified instead.
- **`LLM_TEMPERATURE`** is defined in `.env` but not actually read by the code
  (`sql_node.py` hardcodes `temperature=0`).

## 17. Possible Future Improvements

Not implemented — listed here as natural next steps, not commitments:

- Wire `table_comments`/`column_comments` into retrieval alongside row data
- Incremental/delta re-indexing in `ingest_pipeline.py` (only re-embed changed rows)
- A persistent (not in-memory) backend history store, if a second client besides this
  React app ever needs shared/cross-device history
- An automated test suite (the manual verification approach in [§14](#14-testing--verification-approach)
  has covered every change so far, but doesn't run itself on every future change)
- Support for additional LLM providers beyond Gemini (the codebase's separation between
  `sql_node.py`/`sql_explainer.py` and the rest of the pipeline would make this a
  reasonably contained change)
