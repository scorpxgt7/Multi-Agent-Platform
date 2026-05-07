from dataclasses import dataclass
from typing import Any


@dataclass
class LLMResponse:
    provider: str
    model: str
    output_text: str
    metadata: dict[str, Any]


class BaseLLMProvider:
    provider_name = "base"

    def is_available(self) -> bool:
        return True

    def generate(self, prompt: str, payload: dict[str, Any]) -> LLMResponse:  # pragma: no cover - interface only
        raise NotImplementedError
