"""Text-to-SQL pipeline (Slice A).

Flow:  build focused schema context  →  GENERATE SQL (LLM)  →  VALIDATE
       (read-only guard)  →  EXECUTE  →  on error: SELF-CORRECT (≤2 retries).

Grounding the model in the real schema + executing to verify + feeding back
real errors is what keeps results correct rather than hallucinated.
Later slices add column-value sampling, the semantic layer, and few-shot.
"""
import json
import re
from typing import Any

from app.connectors.base import BaseConnector
from app.services.llm.base import LLMProvider

MAX_RETRIES = 2
ROW_LIMIT = 1000

# Same read-only guard family the SQL editor uses.
READ_ONLY_STARTERS = ("select", "with", "show", "describe", "desc", "explain", "pragma", "values")


def _strip_comments(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    return sql.strip()


def is_read_only(sql: str) -> bool:
    cleaned = _strip_comments(sql).lower()
    if not cleaned.startswith(READ_ONLY_STARTERS):
        return False
    statements = [s for s in cleaned.split(";") if s.strip()]
    return len(statements) <= 1


def _extract_sql(text: str) -> str:
    """Pull SQL out of an LLM response (strip markdown fences / prose)."""
    fence = re.search(r"```(?:sql)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip().rstrip(";").strip()
    return text.strip().rstrip(";").strip()


def build_schema_context(tables: list[dict[str, Any]],
                         samples: dict[str, dict[str, list[str]]] | None = None,
                         descriptions: dict[str, Any] | None = None) -> str:
    """Compact, model-friendly schema string with relationships, real sample
    values for categorical columns, and (when available) business descriptions."""
    samples = samples or {}
    desc = descriptions or {}
    tbl_desc = desc.get("tables", {}) or {}
    col_desc = desc.get("columns", {}) or {}
    lines: list[str] = []
    for t in tables:
        qualified = f"{t['schema_name']}.{t['name']}" if t.get("schema_name") and t["schema_name"] != "public" else t["name"]
        td = tbl_desc.get(t["name"])
        lines.append(f'Table "{qualified}"' + (f' — {td}' if td else "") + ":")
        tbl_samples = samples.get(t["name"], {})
        for c in t["columns"]:
            flags = []
            if c.get("primary_key"):
                flags.append("PK")
            if c.get("references"):
                flags.append(f"FK -> {c['references']}")
            if not c.get("nullable", True):
                flags.append("NOT NULL")
            suffix = f"  [{', '.join(flags)}]" if flags else ""
            vals = tbl_samples.get(c["name"])
            sample_str = f"  — values: {', '.join(repr(v) for v in vals[:12])}" if vals else ""
            cd = col_desc.get(f'{t["name"]}.{c["name"]}')
            desc_str = f"  // {cd}" if cd else ""
            lines.append(f'  - {c["name"]} ({c["type"]}){suffix}{sample_str}{desc_str}')
        lines.append("")
    return "\n".join(lines).strip()


def _examples_block(examples: list[dict[str, str]] | None) -> str:
    if not examples:
        return ""
    pairs = "\n\n".join(f"Q: {e['question']}\nSQL: {e['sql']}" for e in examples)
    return (
        "Examples of questions and the correct SQL for THIS database "
        "(reuse their patterns, table/column names, and filter values):\n" + pairs
    )


# NOTE on prompt caching: the system prompt holds ONLY the stable, per-source
# context (rules + schema + semantic layer) so it forms an identical prefix
# across every question on that source — which OpenAI/Anthropic can cache and
# all users on a shared key reuse. Everything that varies per question
# (few-shot examples, conversation history, the question itself) goes into the
# user message, which is never cached. Keep it that way.
def _system_prompt(dialect: str, schema_context: str, semantic_block: str = "") -> str:
    return f"""You are an expert {dialect} data analyst. Convert the user's question into a single, correct, READ-ONLY SQL query.

Rules:
- Use ONLY the tables and columns in the schema below. Never invent names.
- Output a single SELECT or WITH query. Never INSERT/UPDATE/DELETE/DROP/ALTER/CREATE.
- Use exact table and column names and {dialect} syntax.
- For text filters, use the EXACT sample values shown for that column (match their casing). Never guess a value's spelling or case.
- When a verified metric or glossary term matches the question, use its exact definition.
- The user message may include past Q→SQL examples — reuse their patterns when they fit.
- If a conversation history is given, the new question may be a FOLLOW-UP — resolve references like "that", "those", "the top one", "break it down" using the previous question and SQL.
- Aggregate (GROUP BY) when the question implies totals, counts, or averages.
- Add LIMIT {ROW_LIMIT} unless the user asks for a specific number of rows.
- Respond with ONLY the SQL query — no prose, no explanation, no markdown fences.

Database schema:
{schema_context}{semantic_block}"""


def _user_message(question: str, history: list[dict[str, str]] | None,
                  examples: list[dict[str, str]] | None = None) -> str:
    """The variable part of the prompt: few-shot examples + recent conversation +
    the new question. Kept out of the system prompt so the cached prefix stays stable."""
    parts: list[str] = []
    ex = _examples_block(examples)
    if ex:
        parts.append(ex)
    if history:
        turns = "\n".join(
            f"Previous question: {h['question']}\nSQL used: {h['sql']}"
            for h in history if h.get("question") and h.get("sql")
        )
        if turns:
            parts.append(f"Conversation so far:\n{turns}")
    if not parts:
        return question
    return "\n\n".join(parts) + f"\n\nNew question (may build on the above): {question}"


def _correction_prompt(sql: str, error: str, schema_context: str) -> str:
    return f"""Your previous SQL query failed. Fix it.

Previous SQL:
{sql}

Error from the database:
{error}

Reminder of the available schema:
{schema_context}

Output ONLY the corrected SQL query (single SELECT/WITH, no prose, no fences)."""


_AMBIGUITY_SYSTEM = """You check whether a data question can be answered unambiguously from a database schema.

Return ONLY JSON:
- {"clear": true}                              if you can proceed (a reasonable default exists)
- {"clear": false, "question": "<one short clarifying question>"}   if genuinely ambiguous

Be CONSERVATIVE — only ask when truly necessary, e.g.:
- an undefined business term with no obvious column ("performance", "engagement")
- multiple equally-plausible columns/tables the question could mean
- a comparison/period that materially changes the answer and isn't implied

If a sensible default exists, choose it and return {"clear": true}. Never ask more than one question."""


def check_ambiguity(question: str, schema_context: str, provider: LLMProvider) -> str | None:
    """Returns a clarifying question if the request is genuinely ambiguous, else None.
    Fails open: any error → treat as clear (never block the user on the checker)."""
    try:
        raw = provider.complete(
            system=_AMBIGUITY_SYSTEM,
            user=f"Schema:\n{schema_context}\n\nQuestion: {question}",
            temperature=0.0, max_tokens=200,
        )
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            return None
        data = json.loads(raw[start:end + 1])
        if data.get("clear") is False and data.get("question"):
            return str(data["question"])[:300]
    except Exception:
        return None
    return None


_DASHBOARD_PLANNER_SYSTEM = """You are a senior BI analyst designing an executive dashboard.
Given a database schema and an optional focus topic, propose distinct, high-value analytical
questions that TOGETHER form a useful dashboard.

Rules:
- Each question must be answerable by ONE SQL query over the schema below.
- Cover VARIED angles: a headline KPI (single number), a trend over time, breakdowns by
  category, a top-N ranking, and a comparison — not five versions of the same thing.
- Phrase each as a clear, natural-language question a business user would ask.
- Use ONLY tables/columns that exist in the schema. Never invent entities.
- Return ONLY a JSON array of exactly {n} question strings — no prose, no numbering, no markdown."""


def plan_dashboard_questions(topic: str, schema_context: str, provider: LLMProvider,
                             n: int = 6) -> list[str]:
    """Ask the model to propose N dashboard-worthy questions for this schema/topic.
    Returns a list of natural-language questions (each later run through run_pipeline)."""
    system = _DASHBOARD_PLANNER_SYSTEM.format(n=n)
    user = (f"Database schema:\n{schema_context}\n\n"
            f"Focus topic: {topic or 'a general overview of the most important metrics'}\n\n"
            f"Return exactly {n} questions as a JSON array of strings.")
    raw = provider.complete(system=system, user=user, temperature=0.4, max_tokens=700)
    questions: list[str] = []
    start, end = raw.find("["), raw.rfind("]")
    if start != -1 and end != -1:
        try:
            arr = json.loads(raw[start:end + 1])
            questions = [str(q).strip() for q in arr if str(q).strip()]
        except Exception:
            questions = []
    if not questions:   # fallback: one question per line, strip numbering
        for line in raw.splitlines():
            q = re.sub(r"^[\s\d.\-)*]+", "", line).strip().strip('"')
            if len(q) > 8:
                questions.append(q)
    # de-dupe, keep order, cap at n
    seen, out = set(), []
    for q in questions:
        key = q.lower()
        if key not in seen:
            seen.add(key)
            out.append(q)
    return out[:n]


def run_pipeline(question: str, dialect: str, connector: BaseConnector,
                 provider: LLMProvider, tables: list[dict[str, Any]],
                 samples: dict[str, dict[str, list[str]]] | None = None,
                 examples: list[dict[str, str]] | None = None,
                 descriptions: dict[str, Any] | None = None,
                 semantic_block: str = "",
                 history: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Returns: {sql, columns, rows, row_count, duration_ms, attempts, steps}."""
    schema_context = build_schema_context(tables, samples, descriptions)
    # System = stable per-source prefix (cacheable). Examples ride in the user message.
    system = _system_prompt(dialect, schema_context, semantic_block)
    steps: list[str] = []

    # ── GENERATE (examples + conversation context live in the user message) ──
    raw = provider.complete(system=system, user=_user_message(question, history, examples),
                            temperature=0.0, max_tokens=1024)
    sql = _extract_sql(raw)
    steps.append("generated SQL")

    last_error = ""
    for attempt in range(MAX_RETRIES + 1):
        # ── VALIDATE (read-only guard) ──
        if not is_read_only(sql):
            last_error = "Generated query is not read-only (only SELECT/WITH allowed)"
            steps.append(f"attempt {attempt + 1}: blocked non-read query")
            # ask the model to correct toward a read query
            if attempt < MAX_RETRIES:
                raw = provider.complete(
                    system=system,
                    user=_correction_prompt(sql, last_error, schema_context),
                    temperature=0.0, max_tokens=1024,
                )
                sql = _extract_sql(raw)
                continue
            break

        # ── EXECUTE ──
        try:
            result = connector.execute(sql, ROW_LIMIT)
            steps.append(f"attempt {attempt + 1}: executed OK")
            return {
                "sql": sql,
                "columns": result["columns"],
                "rows": result["rows"],
                "row_count": result["row_count"],
                "duration_ms": result["duration_ms"],
                "attempts": attempt + 1,
                "steps": steps,
                "error": None,
            }
        except Exception as e:
            last_error = str(e).split("\n")[0][:400]
            steps.append(f"attempt {attempt + 1}: error — {last_error[:80]}")
            # ── SELF-CORRECT ──
            if attempt < MAX_RETRIES:
                raw = provider.complete(
                    system=system,
                    user=_correction_prompt(sql, last_error, schema_context),
                    temperature=0.0, max_tokens=1024,
                )
                sql = _extract_sql(raw)

    # exhausted retries
    return {
        "sql": sql, "columns": [], "rows": [], "row_count": 0, "duration_ms": 0,
        "attempts": MAX_RETRIES + 1, "steps": steps, "error": last_error or "Could not produce a working query",
    }
