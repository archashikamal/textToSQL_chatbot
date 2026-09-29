'''Schema introspection helpers for the /api/schema and /api/health endpoints.'''
import os
import sqlite3
from typing import Any, Dict, List


def get_schema(sqlite_path: str) -> List[Dict[str, Any]]:
    """Return every user table in the SQLite database with its columns.

    Table/column metadata is read straight from SQLite's own catalog
    (`sqlite_master` + `PRAGMA table_info`), not from the app's own
    `table_comments`/`column_comments` tables, so it always reflects the real
    schema even if those metadata tables are stale or missing.
    """
    conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        tables = [row[0] for row in cur.fetchall()]

        schema = []
        for table in tables:
            cur.execute(f"PRAGMA table_info({table})")
            columns = [
                {
                    "name": name,
                    # SQLite is dynamically typed; the declared type can be empty.
                    "type": col_type or None,
                    "nullable": not bool(notnull),
                    "primary_key": bool(pk),
                }
                for _cid, name, col_type, notnull, _default, pk in cur.fetchall()
            ]
            schema.append({"table": table, "columns": columns})
        return schema
    finally:
        conn.close()


def check_database(sqlite_path: str) -> Dict[str, Any]:
    """Check that the configured SQLite database can be opened and queried."""
    if not sqlite_path or not os.path.isfile(sqlite_path):
        return {"connected": False, "error": f"Database file not found: {sqlite_path}"}

    try:
        conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
        try:
            conn.execute("SELECT 1")
        finally:
            conn.close()
        return {"connected": True, "error": None}
    except sqlite3.Error as e:
        return {"connected": False, "error": str(e)}
