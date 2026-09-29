'''api.py - FastAPI application for Text-to-SQL service'''

import csv
import io
import logging
import os
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import schema_service
import sql_explainer
from query_service import ALLOWED_TABLES, run_pipeline
from sql_validator import validate_sql

app = FastAPI(title="Text-to-SQL API", version="1.0.0")

# set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Allow a locally-run React dev server (Vite default: 5173, CRA default: 3000) to call
# this API. Adjust/extend via FRONTEND_ORIGINS (comma-separated) if needed.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory, most-recent-first query history shared by every client. Resets on
# restart -- there is no persistent history store yet.
_HISTORY_MAX = 50
_history: deque = deque(maxlen=_HISTORY_MAX)


@app.get("/")
async def root():
    '''Root endpoint'''
    return {"message": "Text-to-SQL API", "docs": "/docs"}


# ---------------------------------------------------------------------------
# /api/* contract for the React frontend.
# ---------------------------------------------------------------------------

class QueryIn(BaseModel):
    '''Request body for POST /api/query.'''
    question: str


class QueryOut(BaseModel):
    '''Response body for POST /api/query.'''
    success: bool
    question: str
    sql: Optional[str] = None
    columns: Optional[List[str]] = None
    rows: Optional[List[Dict[str, Any]]] = None
    row_count: Optional[int] = None
    execution_time_ms: Optional[float] = None
    error: Optional[str] = None


class SchemaColumn(BaseModel):
    '''A single column in a table, as reported by SQLite.'''
    name: str
    type: Optional[str] = None
    nullable: bool
    primary_key: bool


class SchemaTable(BaseModel):
    '''A table and its columns.'''
    table: str
    columns: List[SchemaColumn]


class SchemaOut(BaseModel):
    '''Response body for GET /api/schema.'''
    tables: List[SchemaTable]


class HealthOut(BaseModel):
    '''Response body for GET /api/health.'''
    status: str
    database_connected: bool
    database_path: Optional[str] = None
    database_error: Optional[str] = None
    vector_store_ready: bool
    vector_store_dir: Optional[str] = None


class HistoryItem(BaseModel):
    '''A single past query, most recent history is returned first.'''
    timestamp: str
    question: str
    sql: Optional[str] = None
    success: bool
    row_count: Optional[int] = None
    execution_time_ms: Optional[float] = None
    error: Optional[str] = None


class HistoryOut(BaseModel):
    '''Response body for GET /api/history.'''
    items: List[HistoryItem]


class ExplainIn(BaseModel):
    '''Request body for POST /api/explain.'''
    sql: str = Field(..., min_length=1, max_length=4000)
    question: str = Field(..., min_length=1, max_length=2000)


class ExplainOut(BaseModel):
    '''Response body for POST /api/explain.'''
    success: bool
    explanation: Optional[str] = None
    error: Optional[str] = None


@app.post("/api/query", response_model=QueryOut)
async def api_query(request: QueryIn):
    '''Run the RAG -> SQL generation -> validation -> execution pipeline.'''
    try:
        result = run_pipeline(request.question)
    except Exception as e:  # pylint: disable=broad-except
        # Any unexpected failure (e.g. LLM/API error) is reported as a normal,
        # predictable JSON error response instead of a raw 500.
        logger.exception("Unhandled error while processing query")
        result = {
            "success": False,
            "question": request.question,
            "sql": None,
            "columns": None,
            "rows": None,
            "row_count": None,
            "execution_time_ms": None,
            "error": str(e),
        }

    _history.appendleft(
        HistoryItem(
            timestamp=datetime.now(timezone.utc).isoformat(),
            question=result["question"],
            sql=result.get("sql"),
            success=result["success"],
            row_count=result.get("row_count"),
            execution_time_ms=result.get("execution_time_ms"),
            error=result.get("error"),
        )
    )

    return QueryOut(**result)


@app.post("/api/explain", response_model=ExplainOut)
async def api_explain(request: ExplainIn):
    '''Generate a short, human-readable explanation of an already-generated SQL
    query. Read-only and purely explanatory -- never runs or modifies the SQL,
    and is never called automatically; the frontend only calls this when the
    user explicitly clicks "Explain SQL".
    '''
    sql = request.sql.strip()
    question = request.question.strip()

    if not sql or not question:
        return ExplainOut(success=False, error="Both 'sql' and 'question' are required.")

    # Reuse the same safety validation the generation pipeline enforces, so this
    # endpoint can only ever be asked to explain a read-only SELECT against a
    # known table -- not arbitrary text someone posts directly to the API.
    ok, reason = validate_sql(sql, ALLOWED_TABLES)
    if not ok:
        return ExplainOut(success=False, error=f"Cannot explain: {reason}")

    try:
        explanation = sql_explainer.explain_sql(question, sql)
    except Exception as e:  # pylint: disable=broad-except
        logger.exception("Unhandled error while explaining SQL")
        return ExplainOut(success=False, error=str(e))

    if not explanation:
        return ExplainOut(success=False, error="The model did not return an explanation.")

    return ExplainOut(success=True, explanation=explanation)


@app.get("/api/schema", response_model=SchemaOut)
async def api_schema():
    '''Return every table and its columns from the configured SQLite database.'''
    db_path = os.getenv("DATABASE_PATH")
    try:
        tables = schema_service.get_schema(db_path)
    except Exception as e:  # pylint: disable=broad-except
        logger.exception("Failed to read schema")
        raise HTTPException(status_code=500, detail=f"Could not read schema: {e}") from e
    return SchemaOut(tables=tables)


@app.get("/api/health", response_model=HealthOut)
async def api_health():
    '''Report whether the database and vector store are reachable.'''
    db_path = os.getenv("DATABASE_PATH")
    vector_dir = os.getenv("VECTOR_STORE_DIR")

    db_status = schema_service.check_database(db_path)
    vector_ready = bool(vector_dir and os.path.isdir(vector_dir))

    status = "ok" if db_status["connected"] and vector_ready else "degraded"

    return HealthOut(
        status=status,
        database_connected=db_status["connected"],
        database_path=db_path,
        database_error=db_status["error"],
        vector_store_ready=vector_ready,
        vector_store_dir=vector_dir,
    )


@app.get("/api/history", response_model=HistoryOut)
async def api_history():
    '''Return recent queries (most recent first), newest 50, in-memory only.'''
    return HistoryOut(items=list(_history))


@app.get("/api/export")
async def api_export(question: str = Query(..., min_length=1)):
    '''Run a question through the pipeline and return the results as a CSV file.'''
    try:
        result = run_pipeline(question)
    except Exception as e:  # pylint: disable=broad-except
        logger.exception("Unhandled error while exporting query")
        raise HTTPException(status_code=500, detail=str(e)) from e

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=result["columns"] or [])
    writer.writeheader()
    writer.writerows(result["rows"] or [])
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=query_results.csv"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
