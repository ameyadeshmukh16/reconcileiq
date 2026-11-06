"""Chat client: Vultr Serverless Inference primary, OpenRouter fallback on TRANSIENT failures only.

Transient (fallback allowed): timeouts, connection errors, HTTP 408/429/5xx.
Everything else (bad key, bad model, malformed request, missing config) raises immediately so a
build-time bug surfaces loudly instead of being masked by a silent fallback.
"""
from dataclasses import dataclass

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError

from .. import config

TIMEOUT_S = 60.0


class ConfigError(RuntimeError):
    """Provider is not configured. Never triggers fallback."""


class TransientLLMError(RuntimeError):
    """All configured providers failed with transient errors."""


@dataclass
class Provider:
    name: str          # "vultr" | "openrouter"
    base_url: str
    api_key: str
    model: str

    def client(self) -> OpenAI:
        return OpenAI(base_url=self.base_url, api_key=self.api_key, timeout=TIMEOUT_S, max_retries=0)


def providers() -> dict[str, Provider]:
    return {
        "vultr": Provider("vultr", config.VULTR_BASE_URL, config.VULTR_API_KEY, config.VULTR_MODEL),
        "openrouter": Provider("openrouter", "https://openrouter.ai/api/v1",
                               config.OPENROUTER_API_KEY, config.OPENROUTER_MODEL),
    }


def is_transient(exc: Exception) -> bool:
    if isinstance(exc, (APITimeoutError, APIConnectionError, RateLimitError)):
        return True
    return isinstance(exc, APIStatusError) and (exc.status_code >= 500 or exc.status_code == 408)


def _require(p: Provider) -> None:
    missing = [n for n, v in (("API key", p.api_key), ("base URL", p.base_url), ("model", p.model)) if not v]
    if missing:
        raise ConfigError(f"{p.name} is not configured (missing {', '.join(missing)})")


def chat(messages: list[dict], tools: list[dict], order: tuple[str, ...] = ("vultr", "openrouter")):
    """Return (assistant_message, provider_name, model). Falls back only on transient errors."""
    provs = providers()
    last: Exception | None = None
    for i, name in enumerate(order):
        p = provs[name]
        try:
            _require(p)
        except ConfigError:
            if i == 0:
                raise                      # primary misconfigured: fail loudly
            raise last or TransientLLMError("fallback not configured")   # fallback missing: surface original failure
        try:
            resp = p.client().chat.completions.create(
                model=p.model, messages=messages, tools=tools, tool_choice="auto", temperature=0)
            return resp.choices[0].message, p.name, p.model
        except Exception as exc:           # noqa: BLE001
            if not is_transient(exc):
                raise                      # auth/config/request errors are never masked
            last = exc
    raise TransientLLMError(f"all providers failed transiently: {last!r}") from last
