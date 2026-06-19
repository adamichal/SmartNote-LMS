import logging

import google.generativeai as genai

from backend.config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)

_resolved_model: str | None = None
_available_models: list[str] = []

# Prefer capable models for long Hebrew notebooks (newest stable first).
PREFERRED_MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
]


def _normalize_model_name(name: str) -> str:
    return name.removeprefix("models/")


def list_generate_content_models() -> list[str]:
    if not GEMINI_API_KEY:
        return []

    genai.configure(api_key=GEMINI_API_KEY)
    models: list[str] = []
    for model in genai.list_models():
        methods = getattr(model, "supported_generation_methods", []) or []
        if "generateContent" not in methods:
            continue
        models.append(_normalize_model_name(model.name))
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
            "Create a key at https://aistudio.google.com/apikey (not Vertex AI)."
        )

    configured = _normalize_model_name(GEMINI_MODEL.strip())
    if configured and configured in _available_models:
        _resolved_model = configured
        logger.info("Gemini model from GEMINI_MODEL: %s", _resolved_model)
        return _resolved_model

    if configured:
        logger.warning(
            "GEMINI_MODEL=%s is not available for this key. Available: %s",
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
            "message": "GEMINI_API_KEY is not configured",
            "models": [],
        }

    try:
        model = resolve_gemini_model()
        models = _available_models or list_generate_content_models()
        return {
            "available": True,
            "model": model,
            "configured_model": GEMINI_MODEL,
            "message": "Gemini OK",
            "models": models[:15],
        }
    except Exception as exc:
        logger.error("Gemini startup check FAILED: %s", exc)
        return {
            "available": False,
            "model": GEMINI_MODEL,
            "message": str(exc),
            "models": [],
        }


def get_available_models() -> list[str]:
    if _available_models:
        return _available_models
    return list_generate_content_models()
