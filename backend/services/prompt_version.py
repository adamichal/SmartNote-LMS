"""Track which notebook prompt generated each notebook.

The notebook prompts in gemini.py were rewritten on 2026-08-25, so quality
numbers from old notebooks must not be mixed with new ones.
"""

import hashlib
import re
from datetime import date
from pathlib import Path

# notebooks drafted before this day used the old (pre-rewrite) prompt
PROMPT_REWRITE_DATE = date(2026, 8, 25)

# label for old notebooks — their exact prompt text is unknown, only the era
PRE_REWRITE_LABEL = "pre-2026-08-25"
UNKNOWN = "unknown"

_LOG_LINE = re.compile(r"^\[(\d{4}-\d{2}-\d{2})T[^\]]*\] (.*)$")


def current_prompt_version() -> str:
    # imported lazily so reading versions doesn't need the google-genai import
    from backend.services.gemini import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

    # collapse whitespace so formatting-only edits (like the CRLF cleanup) keep the hash stable
    normalized = " ".join((SYSTEM_PROMPT + USER_PROMPT_TEMPLATE).split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:8]


def draft_date_from_log(lecture_path: Path) -> date | None:
    """Day of the "AI draft saved" line that produced the current notebook.

    File mtimes are useless here (backups move files), so we read pipeline.log.
    A reprocess that was rolled back from backup leaves a draft line for a draft
    that was thrown away, so those lines are dropped on a restore.
    """
    log_path = lecture_path / "pipeline.log"
    if not log_path.is_file():
        return None

    drafts: list[str] = []
    drafts_before_backup = 0
    for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = _LOG_LINE.match(line)
        if not match:
            continue
        day, message = match.groups()
        if message.startswith("AI draft saved"):
            drafts.append(day)
        elif message.startswith("Old notebook files backed up"):
            drafts_before_backup = len(drafts)
        elif re.search(r"restored (previous )?notebook from", message, re.IGNORECASE):
            # the old notebook is back, so drafts from the rolled-back run don't count
            del drafts[drafts_before_backup:]

    return date.fromisoformat(drafts[-1]) if drafts else None


def get_lecture_prompt_version(lecture_path: Path) -> dict:
    """The version recorded in job_status if there is one, otherwise inferred from pipeline.log."""
    from backend.services.job_status import read_job_status

    try:
        recorded = read_job_status(lecture_path).get("prompt_version")
    except (FileNotFoundError, ValueError):
        recorded = None
    if recorded:
        return {"prompt_version": recorded, "prompt_version_inferred": False}

    drafted = draft_date_from_log(lecture_path)
    if drafted is None or drafted == PROMPT_REWRITE_DATE:
        # no draft line, or drafted on the rewrite day itself (could be either prompt)
        version = UNKNOWN
    elif drafted < PROMPT_REWRITE_DATE:
        version = PRE_REWRITE_LABEL
    else:
        # no prompt change since the rewrite, so a later draft used the current prompt
        version = current_prompt_version()
    return {"prompt_version": version, "prompt_version_inferred": True}
