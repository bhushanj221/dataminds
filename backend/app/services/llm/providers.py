"""Concrete LLM providers. Each wraps a vendor SDK behind complete()."""
from app.services.llm.base import LLMProvider


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        from anthropic import Anthropic
        self.client = Anthropic(api_key=api_key)
        self.model = model
        self.prompt_tokens = 0       # accumulated across complete() calls on this instance
        self.completion_tokens = 0
        self.cached_tokens = 0       # subset of prompt_tokens served from prompt cache
        self.cache_key = None        # set by caller for prompt-cache routing (OpenAI only)

    def complete(self, system: str, user: str, temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        u = getattr(resp, "usage", None)
        if u:
            self.prompt_tokens += getattr(u, "input_tokens", 0) or 0
            self.completion_tokens += getattr(u, "output_tokens", 0) or 0
            # Anthropic reports cache reads separately (only with cache_control)
            self.cached_tokens += getattr(u, "cache_read_input_tokens", 0) or 0
        return "".join(block.text for block in resp.content if block.type == "text").strip()


class OpenAIProvider(LLMProvider):
    """Also serves Ollama and any OpenAI-compatible endpoint via base_url."""
    def __init__(self, api_key: str, model: str, base_url: str | None = None):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key or "not-needed", base_url=base_url or None)
        self.model = model
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.cached_tokens = 0       # subset of prompt_tokens served from prompt cache
        self.cache_key = None        # routes requests to a per-tenant prompt-cache lane

    def complete(self, system: str, user: str, temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        kwargs = dict(
            model=self.model,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        # prompt_cache_key segments OpenAI's automatic prompt cache per tenant.
        # Sent via extra_body so it works regardless of SDK version; if the API
        # rejects it (older endpoint), fall back to a plain call — never break.
        if self.cache_key:
            try:
                resp = self.client.chat.completions.create(
                    extra_body={"prompt_cache_key": self.cache_key}, **kwargs)
            except Exception:
                resp = self.client.chat.completions.create(**kwargs)
        else:
            resp = self.client.chat.completions.create(**kwargs)
        u = getattr(resp, "usage", None)
        if u:
            self.prompt_tokens += getattr(u, "prompt_tokens", 0) or 0
            self.completion_tokens += getattr(u, "completion_tokens", 0) or 0
            # cached_tokens is a subset of prompt_tokens already counted above
            details = getattr(u, "prompt_tokens_details", None)
            if details:
                self.cached_tokens += getattr(details, "cached_tokens", 0) or 0
        return (resp.choices[0].message.content or "").strip()
