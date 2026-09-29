# Backend

FastAPI + a RAG (Retrieval-Augmented Generation) pipeline that turns a natural-language
question into a validated, read-only SQL query, runs it against SQLite, and returns the
result as JSON. This is the API the [React frontend](../frontend/README.md) talks to —
see the [root README](../README.md) for the overall project and architecture.

All commands below assume you're in this `backend/` directory.

## Prerequisites

- Python 3.13 (see `.python-version`)
- [`uv`](https://docs.astral.sh/uv/) package manager
- A Google AI (Gemini) API key

On Windows, the terminal's default codepage (cp1252) cannot print the emoji characters
used in `scripts/create_xpto_db.py`'s log output, which crashes the script with a
`UnicodeEncodeError`. Force UTF-8 I/O by setting `PYTHONIOENCODING=utf-8` before running
any of the commands below (not required on macOS/Linux terminals, which default to UTF-8).

```powershell
$env:PYTHONIOENCODING = "utf-8"
```

```bash
export PYTHONIOENCODING=utf-8
```

## Install dependencies

```bash
uv sync
```

This creates `backend/.venv/` and installs everything pinned in `uv.lock` (FastAPI,
LangChain, Chroma, sentence-transformers, torch, etc.). Expect this to take several
minutes on first run — torch and the embedding/rerank models are large downloads.

## Required environment variables

Copy `.env-example` to `.env` and fill in real values:

```bash
cp .env-example .env
```

| Variable | Description | Example |
|---|---|---|
| `DATABASE_PATH` | Path to the SQLite database the app queries | `data/xpto_empresa.db` |
| `VECTOR_COLLECTION` | Chroma collection name | `xpto_database_embeddings` |
| `VECTOR_STORE_DIR` | Directory where Chroma persists its vector store | `data/vector_store` |
| `TOP_K` | Number of reranked documents kept for the LLM prompt | `5` |
| `EMBED_MODEL` | HuggingFace embedding model used for retrieval | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |
| `RERANK_MODEL` | CrossEncoder model used to rerank retrieved docs | `cross-encoder/ms-marco-MiniLM-L-6-v2` |
| `LLM_MODEL` | Gemini model name | `gemini-3.8-flash` |
| `LLM_API_KEY` | **Real** Google AI API key — required for `/api/query` and `/api/explain` to work | *(get one at https://aistudio.google.com/apikey)* |
| `LLM_TEMPERATURE` | Present in `.env` but currently unused by the code (`sql_node.py` hardcodes `temperature=0`) | `0` |
| `ANONYMIZED_TELEMETRY` | Disables ChromaDB telemetry | `False` |
| `FRONTEND_ORIGINS` | Optional, comma-separated. CORS-allowed frontend origins (`api.py`) | Defaults to Vite (`:5173`) and CRA (`:3000`) origins if unset |

Without a valid `LLM_API_KEY`, every module imports and the server starts fine, and
retrieval/reranking work — only the final SQL-generation call to Gemini fails (with a
`400 API_KEY_INVALID` error, returned as a normal `200` response with `success: false`
from `/api/query`, never a raw 500).

**Model note**: `gemini-2.0-flash` and `gemini-2.5-flash` (this repo's original default
and the `.env-example` value) are no longer available to newly-created API keys as of
this writing — Google's API returns a `404` telling you to switch to `gemini-3.8-flash`.
Confirmed working: `gemini-3.8-flash`. If you hit a `404 ... no longer available` error,
check `GET https://generativelanguage.googleapis.com/v1beta/models?key=<your key>` for
the models your key actually has access to.

Newer Gemini model versions (the 3.x line) also return `AIMessage.content` as a list of
typed blocks (e.g. `[{"type": "text", "text": "...", "extras": {...}}]`) instead of a
plain string. `sql_node.py` (and `sql_explainer.py`'s `_extract_text`, for `/api/explain`)
handle both shapes — this is response-parsing compatibility, not a change to the SQL
generation prompt/strategy.

The free tier for `gemini-3.8-flash` has a **daily** request quota (20/day at the time of
writing) shared across every call the backend makes (`/api/query` and `/api/explain`
alike) — testing both features in the same day can exhaust it, surfacing as a `429
... quota exceeded` error. This is expected on a free-tier key, not a bug; wait for the
daily reset or use a paid-tier key for heavier use.

## Database setup

The app needs a SQLite database and a matching Chroma vector store before it can answer
questions. Both are one-time (or re-run-as-needed) steps:

```bash
# 1. Create the sample "XPTO" database with tables, metadata, and sample data
uv run python scripts/create_xpto_db.py

# 2. Index its rows into the Chroma vector store used for retrieval
uv run python ingest_pipeline.py
```

Re-run step 2 any time the database content changes — the ingestion pipeline re-embeds
every row in every table (it does not currently do incremental/delta updates).

## Startup command

```bash
uv run python api.py
```

Starts FastAPI (via `uvicorn`, with `reload=True`) on `http://127.0.0.1:8000`.
Interactive API docs: `http://127.0.0.1:8000/docs`.

For the frontend, see [`../frontend/README.md`](../frontend/README.md) — it needs this
backend running first.

## How to test

There is no automated test suite yet. To manually verify things work end-to-end:

1. **Health check**
   ```bash
   curl http://127.0.0.1:8000/
   ```
   Expect `{"message":"Text-to-SQL API","docs":"/docs"}`.

2. **Query via API** (requires a real `LLM_API_KEY`)
   ```bash
   curl -X POST http://127.0.0.1:8000/api/query \
        -H "Content-Type: application/json" \
        -d '{"question": "How many employees are there?"}'
   ```
   Expect a JSON body with `success: true`, a generated `sql` string, and `rows`.

3. **Query via the React frontend** — with this backend and the frontend's `npm run dev`
   both running, open the frontend and confirm the SQL, results table, chart (where
   applicable), execution time, "Explain SQL", CSV download, and history all work.
   Verified working end-to-end (React → `/api/query` → RAG → SQL generation → validation
   → SQLite) with:
   - "How many employees are there?"
   - "List the names and cities of active clients"
   - "What are the top 3 products by sale price?"

## API (`/api/*`)

This is the entire API surface the React frontend uses, all built on the same RAG → SQL
generation → validation → execution pipeline (`query_service.run_pipeline()`, no
duplicated logic). `GET /` remains as a plain root/info endpoint.

| Endpoint | Description |
|---|---|
| `POST /api/query` | Body `{"question": "..."}`. Runs the full pipeline with validation enforced. Returns `{success, question, sql, columns, rows, row_count, execution_time_ms, error}`. Always responds `200` with `success`/`error` fields set — never a raw 500. |
| `GET /api/schema` | Returns every table and its columns (name, SQL type, nullable, primary key) straight from SQLite's own catalog (`sqlite_master` + `PRAGMA table_info`). |
| `GET /api/health` | Returns `{status, database_connected, database_path, database_error, vector_store_ready, vector_store_dir}`. Checks the SQLite file opens and the Chroma vector store directory exists; does not call the LLM. |
| `GET /api/history` | Returns the last 50 queries made through `/api/query` (question, SQL, success, row count, timing, error), most recent first. **In-memory only** — shared across all clients, resets when the backend restarts. There is no persistent history store yet (the frontend uses its own `localStorage` history instead — see [frontend/README.md](../frontend/README.md)). |
| `GET /api/export?question=...` | Re-runs the pipeline for `question` and streams the result as a downloadable CSV (`text/csv`, `Content-Disposition: attachment`). Returns `400` with a JSON `{"detail": "..."}` if validation/execution fails, `500` for unexpected errors. |
| `POST /api/explain` | Body `{"sql": "...", "question": "..."}`. Returns `{success, explanation, error}` — a short, plain-English explanation of an *already-generated* SQL query, via `sql_explainer.py` (a separate module from `sql_node.py`'s generation pipeline, same LLM config). Re-validates `sql` with the same `validate_sql()` used elsewhere, so it can only explain a real SELECT against a known table. Only ever called when the user clicks "Explain SQL" — never automatically. |

**CORS**: enabled for `http://localhost:5173` / `http://127.0.0.1:5173` (Vite default)
and `http://localhost:3000` / `http://127.0.0.1:3000` (CRA default) out of the box.
Override with a comma-separated `FRONTEND_ORIGINS` env var if your dev server uses a
different port.

All response shapes are defined as Pydantic models in `api.py` (`QueryOut`, `SchemaOut`,
`HealthOut`, `HistoryOut`), so they're validated and documented automatically at
`http://127.0.0.1:8000/docs`.

## Error handling

A systematic pass was made through every failure mode below; each was reproduced live
against a real Gemini key/quota (not guessed) before deciding what to fix.

**Design, unchanged**: `/api/query` and `/api/explain` always respond `200` with
`{success, ..., error}` for *pipeline*-level failures (bad SQL, LLM error, etc.) — this
is intentional, not a gap, so the frontend never has to branch on both HTTP status and a
body field. Genuinely malformed *requests* (missing/invalid fields, unparseable JSON)
still get FastAPI's normal `422` via Pydantic. `/api/schema` returns `500` on a real
server-side failure (no "business" failure mode exists for a read-only endpoint).
`/api/export` returns `400` for pipeline failure, `500` for unexpected errors (it can't
return a JSON `success:false` body on its happy path, since that path is a raw CSV file).

**Fixed, with the reproduction that surfaced each one:**

- **Empty/whitespace questions wasted an LLM call.** `POST /api/query` with
  `{"question": ""}` used to run retrieval and call the LLM before failing — burning
  quota (the free tier is 20 requests/day) for no reason. `run_pipeline()` now rejects
  empty input before touching retrieval/the LLM.
- *(Historical, code since removed)* A legacy Streamlit-only `/query` endpoint once
  returned a bare, non-JSON `500` on LLM or SQL execution failure — fixed at the time,
  then the whole endpoint was later deleted outright (see
  [Migrating away from Streamlit](#migrating-away-from-streamlit)).
- **A non-retryable LLM failure (invalid key, quota exceeded) took 30–90+ seconds to
  surface**, because the client's defaults (`max_retries=6`, no `timeout`) retried with
  exponential backoff regardless of whether the error was retryable. `sql_node.py` and
  `sql_explainer.py` now set `max_retries=2, timeout=30`, bounding worst-case failure
  latency (successful calls are unaffected). This also matters for the frontend: with
  the old delay, a rate-limited request could take longer than Axios's own 60s timeout,
  making a *reachable* backend look like an *unreachable* one to the user.
- **A database-connection problem (wrong `DATABASE_PATH`, missing file) was reported
  identically to a bad-SQL execution problem** ("SQL execution failed: unable to open
  database file"), sending whoever's debugging to look at the generated SQL instead of
  the config. `run_pipeline()` now tells these apart.
- **A RAG retrieval/rerank failure (Chroma unreachable, embedding model failure) had no
  handling of its own** — reproduced by forcing the retriever to raise. It didn't crash
  (the outer endpoint handler still caught it), but the message was whatever the
  underlying library happened to raise. `retriever_node()` now catches this, logs the
  full traceback server-side, and raises a clear, safe summary.
- **Frontend error messages didn't distinguish a timeout from an unreachable backend**
  (Axios sets `.request` in both cases) — fixed in `services/api.js`. Also added
  response-shape validation (`InvalidResponseError`) so a malformed/unexpected response
  body can't crash the UI, and `getSchema`/`getHealth`/`getHistory` now produce the same
  friendly messages `queryDatabase`/`explainSql` already did instead of raw Axios text.
- **`utils/errorMessages.js`'s fallback would override the backend's own new friendly
  messages** ("Please enter a question.", "Could not connect to the database...") with
  a generic "something went wrong" banner, since neither matched an existing pattern.
  Fixed so a short, plain-English backend message is shown as-is; only messages that
  look like a raw technical dump (long, multi-line, stack-trace/library markers) get
  replaced with the generic fallback (raw text still available behind "technical
  details").

**Already sufficient, confirmed rather than assumed:**

- Missing/invalid `LLM_API_KEY` (both empty and unset) doesn't crash the app — it fails
  at the first `.invoke()` call with a clear provider error, caught by the same handlers
  as any other LLM failure.
- Malformed requests (invalid JSON, missing/wrong-typed fields) — confirmed via curl to
  return FastAPI's normal `422` with a structured `detail` list, no stack trace.
- `sqlite3.Error` during execution (e.g. the real `no such column: f.departamento_id`
  hit during earlier testing) was already caught and reported cleanly.
- Every unhandled exception is logged server-side with `logger.exception(...)` /
  `logging.exception(...)` (full traceback in the log), while only a short message ever
  reaches the response body — confirmed by reading the actual server logs, not assumed.
- No error message anywhere echoes back `LLM_API_KEY` — Google's own provider errors
  don't include the key value, and nothing in this codebase formats it into a message.

## Migrating away from Streamlit

Streamlit (`ui.py`) was the project's original frontend. Once the React app
(`../frontend/`) reached full feature parity, Streamlit was removed entirely — this
section is the record of that parity check and the cleanup that followed.

### Feature parity check

| Streamlit (`ui.py`, before removal) | React equivalent |
|---|---|
| API health check in the sidebar | `Sidebar.jsx`'s health badge, polling `GET /api/health` |
| Text area + "Query" button | `ChatInterface.jsx`'s input box + Ask button |
| "Show generated SQL" checkbox | Not carried over — SQL is always shown (`SqlViewer.jsx`), which is strictly more transparent; there was no case for hiding it |
| Static example-questions list | `ChatInterface.jsx`'s empty state — clickable, fills the input, instead of plain read-only text |
| "Clear" button | "New Query" button (clears the conversation) |
| Generated SQL via `st.code` | `SqlViewer.jsx` — syntax-highlighted, copyable, plus "Explain SQL" (a capability Streamlit never had) |
| Results `st.dataframe` + record/column-count metrics | `ResultTable.jsx` (row count shown in the message footer; a separate "Columns" metric widget wasn't carried over — trivially visible from the table header) |
| CSV download button | `Message.jsx`'s "Download CSV" — generated client-side from the displayed result (Streamlit's re-derived it from the same in-memory dataframe each render; functionally equivalent, see [frontend/README.md](../frontend/README.md) for why it isn't proxied through the backend) |
| Session-based query history (sidebar, last 5) | `utils/queryHistory.js` — `localStorage`-backed, persists across reloads, not just the session. (Streamlit's history *button* actually looked to have a latent bug: clicking it set `st.session_state.selected_question` but the `text_area` never read that value back, so it likely never visibly restored anything — the React version's click-to-restore genuinely works, verified.) |
| — (Streamlit had no charts) | `ChartView.jsx` + `utils/chartAnalysis.js` — new, additive |
| — (Streamlit had no schema browser) | `SchemaExplorer.jsx` — new, additive |

Every one of the 9 capabilities the migration required was confirmed working, live,
against the real backend: natural language query, SQL generation, SQL display, result
table, charts, schema exploration, query history, CSV export, and SQL explanation.

### What was removed

- **`ui.py`** — deleted.
- **The legacy `POST /query` endpoint** (`api.py`) and its underlying
  `query_service.query()` function — deleted. Both existed solely for `ui.py`'s backward
  compatibility (per their own code comments); nothing else called them, confirmed by
  grepping the whole codebase (including the frontend) before removing. `GET /` was
  **kept** — it's a generic root/info endpoint, not Streamlit-specific.
- **Dependencies**: `streamlit`, `pandas`, `requests` removed from `pyproject.toml` via
  `uv remove` (confirmed via grep that nothing else in the backend imports any of the
  three). `requests` is still present in `uv.lock` as a legitimate *transitive* dependency
  of several packages already in the tree (`google-api-core`, `huggingface-hub`, etc.) —
  that's expected and correct, not a leftover.

## Dependency audit (`pyproject.toml`)

A later audit pass found and removed three more genuinely unused direct dependencies —
unrelated to Streamlit, just dead weight found while checking the same thing:
`langchain`, `langchain-community`, and `torchvision` were listed but never actually
imported anywhere in the codebase (confirmed by grepping every `.py` file), and nothing
else in the resolved dependency tree required them either (confirmed by checking
`uv.lock` for reverse dependencies before removing — each had exactly one dependent:
this project itself). Removed via `uv remove langchain langchain-community torchvision`,
which dropped 26 packages total from the resolved tree (the unused
`langchain`/`langchain-community` pair pulled in a substantial amount of the `langgraph`
ecosystem that nothing here uses). Re-verified the backend still imports and runs
correctly afterwards.

### What was intentionally kept

- **The RAG pipeline itself** (`retriever_node.py`, `sql_node.py`, `sql_validator.py`,
  `sql_executor.py`) — completely untouched by this migration.
- **Every `/api/*` endpoint** the React frontend depends on.
- **`GET /api/history`** on the backend — still there and still works, even though the
  frontend sidebar now reads from `localStorage` instead; removing a working, harmless
  endpoint wasn't necessary just because one particular caller stopped using it.

### Verifying the migration

```bash
uv sync                                  # picks up the dependency removal
uv run python api.py                     # starts cleanly, no streamlit/pandas/requests installed

curl http://127.0.0.1:8000/              # 200 -- still works
curl http://127.0.0.1:8000/query         # 404 -- confirms the legacy endpoint is gone
curl http://127.0.0.1:8000/api/health    # 200 -- confirms the real API surface is untouched
```
