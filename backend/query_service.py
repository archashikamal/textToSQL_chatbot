'''Query service module for the Text-to-SQL Chatbot with RAG application.
'''
import os
import time
import sqlite3
import logging
from typing import Any, Dict

from retriever_node import retriever_node
from sql_node import sql_generator_node
from sql_validator import validate_sql, allowed_tables_from_db
from sql_executor import execute_sql

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_TABLES = allowed_tables_from_db(os.getenv("DATABASE_PATH"))


def run_pipeline(question: str) -> Dict[str, Any]:
    """Run the RAG -> SQL generation -> validation -> execution pipeline and return a
    fully structured, JSON-serializable result for the /api/query endpoint.

    Enforces SQL validation: a query that fails validation is reported as an
    error and is never executed.
    """
    started = time.perf_counter()

    def _elapsed_ms() -> float:
        return round((time.perf_counter() - started) * 1000, 2)

    def _error(sql, message, level="error"):
        getattr(logger, level)(message)
        return {
            "success": False,
            "question": question,
            "sql": sql,
            "columns": None,
            "rows": None,
            "row_count": None,
            "execution_time_ms": _elapsed_ms(),
            "error": message,
        }

    question = (question or "").strip()
    if not question:
        # A rejected empty input, not a system failure -- logged at info level,
        # and short-circuited before ever touching retrieval/the LLM.
        return _error(None, "Please enter a question.", level="info")

    logger.info("Processing query request: %s", question)
    state = {"question": question, "messages": []}

    # 1. retrieve
    state = retriever_node(state)

    # 2. generate SQL
    state = sql_generator_node(state)
    sql = state["generated_sql"]

    if not sql:
        return _error(None, "The model did not return a valid SQL SELECT statement.")

    # 3. validate
    ok, reason = validate_sql(sql, ALLOWED_TABLES)
    if not ok:
        return _error(sql, f"SQL validation failed: {reason}")

    # 4. execute
    try:
        cols, rows = execute_sql(sql)
    except sqlite3.OperationalError as e:
        if "unable to open database file" in str(e):
            # A config/deployment problem (wrong DATABASE_PATH, missing file,
            # permissions), not a bad-SQL problem -- worth telling apart so
            # whoever's debugging isn't sent looking at the generated SQL.
            return _error(sql, "Could not connect to the database. Please contact the administrator.")
        return _error(sql, f"SQL execution failed: {e}")
    except sqlite3.Error as e:
        return _error(sql, f"SQL execution failed: {e}")

    result_rows = [dict(zip(cols, r)) for r in rows]
    return {
        "success": True,
        "question": question,
        "sql": sql,
        "columns": cols,
        "rows": result_rows,
        "row_count": len(result_rows),
        "execution_time_ms": _elapsed_ms(),
        "error": None,
    }
