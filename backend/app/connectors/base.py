"""Connector interface.

Every data source type (SQL database, warehouse, REST API, file…) implements
this interface. The rest of the platform — query engine, schema browser,
AI pipeline — only ever talks to these three methods.
"""
from abc import ABC, abstractmethod
from typing import Any


class BaseConnector(ABC):

    @abstractmethod
    def test(self) -> float:
        """Open a connection and run a trivial probe. Returns latency in ms.
        Raises an exception with a human-readable message on failure."""

    @abstractmethod
    def get_schema(self) -> list[dict[str, Any]]:
        """Return [{name, schema_name, columns: [{name, type, nullable, primary_key}]}]."""

    @abstractmethod
    def execute(self, sql: str, limit: int = 1000) -> dict[str, Any]:
        """Run a query. Returns {columns: [...], rows: [[...]], row_count, duration_ms}."""
