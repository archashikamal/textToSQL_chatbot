# Text-to-SQL Chatbot with RAG

A chatbot that converts natural language questions into SQL queries using
Retrieval-Augmented Generation (RAG). Ask questions in plain English through the React
dashboard and get SQL, a results table, charts, and explanations — backed by a FastAPI
API.

## 🌟 Features

- **Natural Language to SQL**: convert everyday questions into precise, read-only SQL
- **RAG Architecture**: retrieves relevant schema/row context to generate accurate queries
- **Real-time Validation**: SQL is validated (SELECT-only, allowed tables) before execution
- **React Dashboard**: chat-style query interface, SQL viewer, results table, auto-detected
  charts, schema explorer, query history, CSV export, and "Explain SQL"
- **FastAPI Backend**: a documented `/api/*` JSON API, usable independently of the frontend
- **Query History**: kept in the browser (`localStorage`), no backend database required
- **Export Results**: download query results as CSV, generated client-side

## 🏗️ Architecture

```text
React + Vite (frontend/, :5173)
    │  chat UI, SQL viewer, table/chart, schema explorer,
    │  history (localStorage), CSV export, "Explain SQL"
    │
    │  HTTP (/api/*)
    ▼
FastAPI (backend/api.py, :8000)
    │
    ▼
query_service.run_pipeline()
    │
    ├─ retriever_node.py   -- Chroma vector store + HuggingFace embeddings
    │                          + CrossEncoder rerank
    ├─ sql_node.py         -- SQL generation (Gemini)
    ├─ sql_explainer.py    -- "Explain SQL" (separate Gemini call, same config)
    ├─ sql_validator.py    -- SELECT-only, allowed-tables check (sqlglot)
    └─ sql_executor.py     -- read-only SQLite execution
```

The RAG loop: a question is embedded and matched against rows already indexed into a
Chroma vector store, reranked, and used as context for the LLM to generate a single
read-only `SELECT` statement, which is validated (statement type, allowed tables) and
run against SQLite with a row limit.

## 📁 Project Structure

This is a two-package repo: a Python backend and a Node/React frontend, each
self-contained with its own dependencies and its own README.

```text
text-to-sql-chatbot-with-rag/
├── README.md                 # you are here
├── LICENSE
├── backend/                  # FastAPI + RAG pipeline -- see backend/README.md
│   ├── api.py                 # FastAPI server (/api/* JSON API)
│   ├── query_service.py       # Orchestrates the RAG -> SQL -> validate -> execute pipeline
│   ├── retriever_node.py      # RAG retrieval + rerank component
│   ├── sql_node.py            # SQL generation with the LLM (Gemini)
│   ├── sql_validator.py       # SQL safety validation (SELECT-only, allowed tables)
│   ├── sql_executor.py        # Read-only SQLite query execution
│   ├── sql_explainer.py       # "Explain SQL" -- turns generated SQL back into plain English
│   ├── schema_service.py      # Schema introspection for /api/schema and /api/health
│   ├── ingest_pipeline.py     # One-time/re-run: indexes DB rows into the Chroma vector store
│   ├── scripts/
│   │   └── create_xpto_db.py  # Sample database creation
│   ├── pyproject.toml / uv.lock
│   ├── .env-example
│   ├── README.md               # full backend setup, env vars, API docs, error-handling notes
│   └── data/                   # generated: sample SQLite DB + Chroma vector store (gitignored)
└── frontend/                  # React + Vite dashboard -- see frontend/README.md
    ├── src/
    ├── package.json
    ├── .env.example
    └── README.md
```

## 🚀 Quick Start

### Prerequisites

- Python 3.13 (see `backend/.python-version`)
- [`uv`](https://docs.astral.sh/uv/) package manager
- Node.js + npm (for the frontend)
- A Google AI (Gemini) API key

See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md)
for the full setup guide, including a Windows console-encoding note and known
model-availability caveats. The short version:

```bash
# Backend
cd backend
uv sync
cp .env-example .env                        # then set a real LLM_API_KEY
uv run python scripts/create_xpto_db.py      # sample database
uv run python ingest_pipeline.py             # index it into the vector store
uv run python api.py                         # http://127.0.0.1:8000

# Frontend (in a second terminal, from the repo root)
cd frontend
npm install
cp .env.example .env                         # points at the backend above by default
npm run dev                                  # http://localhost:5173
```

## 🔧 Configuration

### Environment Variables

See [`backend/.env-example`](backend/.env-example) and
[`backend/README.md`](backend/README.md#required-environment-variables) for the full
list and current model-availability notes. The essentials:

| Variable | Description |
|----------|-------------|
| `LLM_MODEL` | Gemini model name (see backend/README.md for which models are currently available) |
| `LLM_API_KEY` | Google AI API key — required for `/api/query` and `/api/explain` |
| `DATABASE_PATH` | Path to the SQLite database |
| `VECTOR_STORE_DIR` | Where the Chroma vector store is persisted |

Frontend: `frontend/.env.example` — just `VITE_API_URL`, the backend's base URL.

### Supported Query Types

- **Aggregation**: "How many sales were made?"
- **Filtering**: "Show customers from New York"
- **Sorting**: "Top 10 products by revenue"
- **Grouping**: "Sales by month"
- **Joins**: "Customer orders with product details"

## 📊 Example Usage

### React Dashboard

1. Open `http://localhost:5173`
2. Type a question (or click one of the example prompts)
3. View the generated SQL, results table (or chart, when the shape supports it), and
   execution time
4. Click "Explain SQL" for a plain-English summary, or "Download CSV" to export

### API Request

```bash
curl -X POST "http://localhost:8000/api/query" \
     -H "Content-Type: application/json" \
     -d '{"question": "How many orders were placed last month?"}'
```

### Response

```json
{
  "success": true,
  "question": "How many orders were placed last month?",
  "sql": "SELECT COUNT(*) AS total_orders FROM orders WHERE DATE(created_at) >= DATE('now', '-1 month')",
  "columns": ["total_orders"],
  "rows": [{"total_orders": 150}],
  "row_count": 1,
  "execution_time_ms": 842.13,
  "error": null
}
```

The full endpoint list (`/api/query`, `/api/schema`, `/api/health`, `/api/history`,
`/api/export`, `/api/explain`) is documented in
[`backend/README.md`](backend/README.md#api-api), and interactively at
`http://127.0.0.1:8000/docs` once the backend is running.

## 🛡️ Security Features

- **SQL Injection Protection**: only `SELECT` statements are allowed
- **Table Validation**: queries are limited to tables that actually exist in the database
- **Syntax Validation**: SQL is parsed and validated before execution
- **Read-only Access**: the database connection itself is opened read-only

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

#### API Connection Failed (from the React app)

- Ensure the FastAPI server is running on `http://127.0.0.1:8000` (or wherever
  `frontend/.env`'s `VITE_API_URL` points)
- Check the backend's CORS settings (`FRONTEND_ORIGINS` in `backend/.env`) include the
  frontend's origin

#### No Results Returned

- Verify `DATABASE_PATH` is correct and the database file exists
- Check the vector store (`VECTOR_STORE_DIR`) was created by `ingest_pipeline.py`
- Try rephrasing the question to be more specific about which table/columns you mean

#### SQL Generation Errors

- Make sure the database has been indexed into the vector store
- Check `LLM_API_KEY` is set to a real, valid key and the model in `LLM_MODEL` is
  actually available to it (see `backend/README.md`'s model note)

### Getting Help

- Open an issue on GitHub
- Check existing issues for solutions
- Review the API documentation at `/docs`, and the deeper setup/error-handling notes in
  [`backend/README.md`](backend/README.md)

---

Made with ❤️ using LangChain, FastAPI, and React
