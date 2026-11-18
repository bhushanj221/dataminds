"""Maps a data source type to its connector class.

Ingested sources (file uploads, Google Sheets, REST APIs) are stored as
DuckDB files, so they reuse the SQL connector — `database` is the path.
"""
from app.connectors.base import BaseConnector
from app.connectors.sql_connector import SQLConnector, ALL_TYPES as SQL_TYPES

# Sources created by the ingestion service — queried via DuckDB
INGESTED_TYPES: set[str] = {"file", "gsheets", "restapi"}

ALL_TYPES: set[str] = set(SQL_TYPES) | INGESTED_TYPES


def get_connector(
    type: str,
    database: str,
    host: str | None = None,
    port: int | None = None,
    username: str | None = None,
    password: str | None = None,
    options: dict[str, str] | None = None,
) -> BaseConnector:
    if type in INGESTED_TYPES:
        return SQLConnector(type="duckdb", database=database)
    if type in SQL_TYPES:
        return SQLConnector(
            type=type, database=database, host=host, port=port,
            username=username, password=password, options=options,
        )
    raise ValueError(f"No connector registered for type '{type}'")
