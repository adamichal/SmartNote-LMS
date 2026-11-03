import logging

from google import genai

from backend.config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)

_client: genai.Client | None = None
_resolved_model: str | None = None
_available_models: list[str] = []

PREFERRED_MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
]


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _normalize_model_name(name: str) -> str:
    return name.removeprefix("models/")


def list_generate_content_models() -> list[str]:
    if not GEMINI_API_KEY:
        return []

    client = get_client()
    models: list[str] = []
    for model in client.models.list():
        name = _normalize_model_name(getattr(model, "name", "") or "")
        if not name.startswith("gemini-"):
            continue
        actions = getattr(model, "supported_actions", None)
        if actions and "generateContent" not in actions:
            continue
        models.append(name)
    return sorted(set(models))


def resolve_gemini_model() -> str:
    global _resolved_model, _available_models
    if _resolved_model:
        return _resolved_model

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    _available_models = list_generate_content_models()
    if not _available_models:
        raise RuntimeError(
            "No Gemini models available for this API key. "
            "Verify the key at https://aistudio.google.com/apikey"
        )

    configured = _normalize_model_name(GEMINI_MODEL.strip())
    if configured and configured in _available_models:
        _resolved_model = configured
        logger.info("Gemini model from GEMINI_MODEL: %s", _resolved_model)
        return _resolved_model

    if configured:
        logger.warning(
            "GEMINI_MODEL=%s is not available. Available: %s",
            configured,
            ", ".join(_available_models[:8]),
        )

    for candidate in PREFERRED_MODELS:
        if candidate in _available_models:
            _resolved_model = candidate
            logger.info("Gemini model auto-selected: %s", _resolved_model)
            return _resolved_model

    _resolved_model = _available_models[0]
    logger.info("Gemini model fallback: %s", _resolved_model)
    return _resolved_model


def verify_gemini_on_startup() -> dict:
    if not GEMINI_API_KEY:
        return {
            "available": False,
            "model": GEMINI_MODEL,
            "key_type": None,
            "message": "GEMINI_API_KEY is not configured",
            "models": [],
        }

    try:
        model = resolve_gemini_model()
        models = _available_models or list_generate_content_models()
        key_type = "auth (AQ.)" if GEMINI_API_KEY.startswith("AQ.") else "standard (AIza)"
        return {
            "available": True,
            "model": model,
            "configured_model": GEMINI_MODEL,
            "key_type": key_type,
            "message": "Gemini OK",
            "models": models[:15],
        }
    except Exception as exc:
        logger.error("Gemini startup check FAILED: %s", exc)
        return {
            "available": False,
            "model": GEMINI_MODEL,
            "key_type": "auth (AQ.)" if GEMINI_API_KEY.startswith("AQ.") else "standard (AIza)",
            "message": str(exc),
            "models": [],
        }
