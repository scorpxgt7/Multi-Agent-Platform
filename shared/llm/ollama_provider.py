from typing import Any

import httpx

from shared.llm.base import BaseLLMProvider, LLMResponse


class OllamaProvider(BaseLLMProvider):
    provider_name = "ollama"

    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, prompt: str, payload: dict[str, Any]) -> LLMResponse:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": f"{prompt}\n\nPayload:\n{payload}",
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
        return LLMResponse(
            provider=self.provider_name,
            model=self.model,
            output_text=data.get("response", ""),
            metadata={"base_url": self.base_url},
        )
