"""Track which notebook prompt generated each notebook.

The notebook prompts in gemini.py were rewritten on 2026-08-25, so quality
numbers from old notebooks must not be mixed with new ones.
"""

import hashlib
from datetime import date, datetime
from pathlib import Path

# notebooks generated before this date used the old (pre-rewrite) prompt
PROMPT_REWRITE_DATE = date(2026, 8, 25)

# label for old notebooks — their exact prompt text is unknown, only the era
PRE_REWRITE_LABEL = "pre-2026-08-25"


def current_prompt_version() -> str:
    # imported lazily so reading versions doesn't need the google-genai import
    from backend.services.gemini import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

    # collapse whitespace so formatting-only edits (like the CRLF cleanup) keep the hash stable
    normalized = " ".join((SYSTEM_PROMPT + USER_PROMPT_TEMPLATE).split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:8]


def _generation_date(lecture_path: Path, status: dict) -> date | None:
    completed = status.get("completed_at")
    if completed:
        try:
            return datetime.fromisoformat(completed).date()
        except ValueError:
            pass
    # fall back to when the AI draft was written
    draft = lecture_path / "transcripts" / "ai_draft.md"
    if draft.is_file():
        return datetime.fromtimestamp(draft.stat().st_mtime).date()
    return None


def get_lecture_prompt_version(lecture_path: Path) -> dict:
    """The version recorded in job_status if there is one, otherwise inferred from the date."""
    from backend.services.job_status import read_job_status

    try:
        status = read_job_status(lecture_path)
    except FileNotFoundError:
        status = {}

    recorded = status.get("prompt_version")
    if recorded:
        return {"prompt_version": recorded, "prompt_version_inferred": False}

    generated = _generation_date(lecture_path, status)
    if generated is None:
        return {"prompt_version": "unknown", "prompt_version_inferred": True}
    if generated < PROMPT_REWRITE_DATE:
        return {"prompt_version": PRE_REWRITE_LABEL, "prompt_version_inferred": True}
    # no prompt change since the rewrite, so a post-rewrite notebook used the current prompt
    return {"prompt_version": current_prompt_version(), "prompt_version_inferred": True}
