from shared.llm.mock_provider import MockProvider
from shared.llm.ollama_provider import OllamaProvider
from shared.llm.openai_provider import OpenAIProvider


def get_provider(settings):
    selected = (settings.model_provider or "mock").strip().lower()

    if selected == "openai":
        provider = OpenAIProvider(settings.openai_base_url, settings.openai_api_key, settings.openai_model)
        if provider.is_available():
            return provider, {"selected": selected, "active": provider.provider_name, "fallback": False}
        return MockProvider(), {"selected": selected, "active": "mock", "fallback": True, "reason": "missing_openai_api_key"}

    if selected == "ollama":
        return OllamaProvider(settings.ollama_base_url, settings.ollama_model), {
            "selected": selected,
            "active": "ollama",
            "fallback": False,
        }

    return MockProvider(), {"selected": selected, "active": "mock", "fallback": selected != "mock"}
