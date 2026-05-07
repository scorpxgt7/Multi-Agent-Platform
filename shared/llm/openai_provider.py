from typing import Any

import httpx

from shared.llm.base import BaseLLMProvider, LLMResponse


class OpenAIProvider(BaseLLMProvider):
    provider_name = "openai"

    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def is_available(self) -> bool:
        return bool(self.api_key)

    def generate(self, prompt: str, payload: dict[str, Any]) -> LLMResponse:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You are a modular skill execution provider."},
                        {"role": "user", "content": f"{prompt}\n\nPayload:\n{payload}"},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        return LLMResponse(
            provider=self.provider_name,
            model=self.model,
            output_text=content,
            metadata={"base_url": self.base_url},
        )
