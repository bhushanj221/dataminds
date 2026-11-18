"""LLM provider interface.

Every provider (Anthropic, OpenAI, Ollama, …) implements complete().
The text-to-SQL pipeline only ever calls this — swapping providers, or a
customer bringing their own key, changes nothing downstream.
"""
from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    def complete(self, system: str, user: str, temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        """Single-turn completion. Returns the assistant's text."""
