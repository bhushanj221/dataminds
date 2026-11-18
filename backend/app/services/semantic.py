"""Semantic layer — bootstrap + prompt context.

Bootstrap: ask the LLM to describe every table/column and suggest business
metrics + glossary terms from the schema and real sample values.

Context: descriptions annotate the schema; verified metrics and glossary
terms are injected into the text-to-SQL prompt so the model reuses real
business logic instead of inventing it (+12–18% accuracy per CLAUDE.md §7.3).
"""
import json
import re
from typing import Any

from app.services.llm.base import LLMProvider
from app.services.text_to_sql import build_schema_context


def _extract_json(text: str) -> dict:
    """Pull a JSON object out of an LLM response (tolerates fences/prose)."""
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    raw = fence.group(1) if fence else text
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response")
    return json.loads(raw[start:end + 1])


BOOTSTRAP_SYSTEM = """You document databases for a business-intelligence tool.
Given a schema with sample values, produce concise, business-friendly documentation.

Return ONLY a JSON object with this exact shape:
{
  "tables": { "table_name": "one-sentence description" },
  "columns": { "table_name.column_name": "short description" },
  "metrics": [
    { "name": "snake_case_name", "description": "what it measures",
      "table": "table_name", "expression": "<SQL expression valid in SELECT over that table>" }
  ],
  "glossary": [ { "term": "business term", "definition": "plain-English meaning, mention relevant columns/values" } ]
}

Rules:
- Describe ONLY tables/columns present in the schema. Use exact names.
- metrics.expression must be a single SQL aggregate expression (e.g. "SUM(amount)",
  "COUNT(*)", "COUNT(*) FILTER (WHERE status = 'COMPLETE')") valid in SELECT over its table.
- Suggest 3–8 of the most useful metrics. Use the REAL sample values shown for filters.
- Keep descriptions under 120 characters. No prose outside the JSON."""


def bootstrap(provider: LLMProvider, tables: list[dict[str, Any]],
              samples: dict[str, dict[str, list[str]]] | None) -> dict[str, Any]:
    schema_context = build_schema_context(tables, samples)
    raw = provider.complete(
        system=BOOTSTRAP_SYSTEM,
        user=f"Schema:\n{schema_context}\n\nProduce the documentation JSON.",
        temperature=0.2, max_tokens=2000,
    )
    data = _extract_json(raw)
    # normalize shape
    return {
        "tables": data.get("tables", {}) or {},
        "columns": data.get("columns", {}) or {},
        "metrics": data.get("metrics", []) or [],
        "glossary": data.get("glossary", []) or [],
    }


def build_descriptions_block(doc: dict[str, Any]) -> dict[str, Any]:
    """Returns descriptions in the shape build_schema_context expects:
    {table: desc, columns: {table.col: desc}}. (We pass via a wrapper.)"""
    return {
        "tables": doc.get("tables", {}) or {},
        "columns": doc.get("columns", {}) or {},
    }


def build_semantic_prompt(doc: dict[str, Any], metrics: list[dict[str, Any]]) -> str:
    """Verified-metrics + glossary block appended to the system prompt."""
    blocks: list[str] = []

    verified = [m for m in metrics if m.get("verified")]
    if verified:
        lines = [
            f'- "{m["name"]}" on table {m["table_name"]}: {m["expression"]}'
            + (f'  — {m["description"]}' if m.get("description") else "")
            for m in verified
        ]
        blocks.append(
            "Verified metrics (reuse these EXACT expressions when relevant; do not reinvent them):\n"
            + "\n".join(lines)
        )

    glossary = doc.get("glossary") or []
    if glossary:
        lines = [f'- {g["term"]}: {g["definition"]}' for g in glossary if g.get("term")]
        if lines:
            blocks.append("Business glossary:\n" + "\n".join(lines))

    return ("\n\n" + "\n\n".join(blocks)) if blocks else ""
