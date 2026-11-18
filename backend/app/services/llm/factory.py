"""Provider factory + per-provider default models.

This is the one place that knows about vendors. Resolving which provider/key
to use (platform default vs a customer's own key) happens in the API layer.
"""
from app.services.llm.base import LLMProvider
from app.services.llm.providers import AnthropicProvider, OpenAIProvider

# Current model IDs. Generation favours accuracy (Sonnet / GPT-4o).
DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "ollama": "llama3.1",
}

# Cheap, fast models for lightweight steps (ambiguity check / classification).
CLASSIFY_MODELS = {
    "anthropic": "claude-haiku-4-5-20251001",
    "openai": "gpt-4o-mini",
    "ollama": "llama3.1",
}

SUPPORTED_PROVIDERS = set(DEFAULT_MODELS)

DEFAULT_OLLAMA_URL = "http://host.docker.internal:11434/v1"


def get_provider(provider: str, api_key: str, model: str | None = None,
                 base_url: str | None = None) -> LLMProvider:
    provider = (provider or "anthropic").lower()
    model = model or DEFAULT_MODELS.get(provider, "")
    if provider == "anthropic":
        return AnthropicProvider(api_key=api_key, model=model)
    if provider == "openai":
        return OpenAIProvider(api_key=api_key, model=model, base_url=base_url or None)
    if provider == "ollama":
        return OpenAIProvider(api_key="ollama", model=model, base_url=base_url or DEFAULT_OLLAMA_URL)
    raise ValueError(f"Unknown LLM provider '{provider}'. Supported: {', '.join(sorted(SUPPORTED_PROVIDERS))}")
