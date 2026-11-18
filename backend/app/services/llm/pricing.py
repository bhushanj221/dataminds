"""Rough USD cost estimation from token counts. Prices are per 1M tokens
(input, output) and approximate — enough for the admin cost-view, not billing.
Matched by substring against the model id; Ollama/local models are free."""

_PRICES = {
    # model substring : (input_per_1M, output_per_1M)
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "o1": (15.00, 60.00),
    "claude-haiku": (0.80, 4.00),
    "claude-sonnet": (3.00, 15.00),
    "claude-opus": (15.00, 75.00),
    "llama": (0.0, 0.0),
    "ollama": (0.0, 0.0),
}
_DEFAULT = (1.00, 3.00)  # unknown model — conservative blended guess

# Cache-hit input tokens are billed at a discount. OpenAI charges ~50% for
# prompt_tokens_details.cached_tokens; this is exact for the OpenAI path.
CACHE_READ_DISCOUNT = 0.5


def _rate(model: str | None) -> tuple[float, float]:
    m = (model or "").lower()
    for key, price in _PRICES.items():
        if key in m:
            return price
    return _DEFAULT


def estimate_cost(prompt_tokens: int, completion_tokens: int, model: str | None,
                  cached_tokens: int = 0) -> float:
    """USD estimate. `cached_tokens` is the subset of `prompt_tokens` that were
    served from the prompt cache — billed at CACHE_READ_DISCOUNT of the input rate."""
    cin, cout = _rate(model)
    cached = max(0, min(cached_tokens, prompt_tokens))
    full_input = prompt_tokens - cached
    return round(
        (full_input / 1_000_000) * cin
        + (cached / 1_000_000) * cin * CACHE_READ_DISCOUNT
        + (completion_tokens / 1_000_000) * cout,
        4,
    )
