from typing import Any

from shared.llm.base import BaseLLMProvider, LLMResponse


class MockProvider(BaseLLMProvider):
    provider_name = "mock"

    def generate(self, prompt: str, payload: dict[str, Any]) -> LLMResponse:
        task = payload.get("input", {}).get("task") or payload.get("input", {}).get("summary") or "the requested task"
        return LLMResponse(
            provider=self.provider_name,
            model="deterministic-mock",
            output_text=f"Mock provider reviewed {task}. Prompt context was preserved for downstream validation.",
            metadata={"fallback": True, "tools": payload.get("tools", [])},
        )
