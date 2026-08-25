"""Dedicated closing-summary generation (second Gemini pass)."""

from __future__ import annotations

import re
from pathlib import Path

from google.genai import types

from backend.config import GEMINI_API_KEY
from backend.services.gemini_utils import get_client, resolve_gemini_model
from backend.services.job_status import log_pipeline

_RETRY_DELAYS = [20, 45, 90]
_RETRIABLE_STRINGS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overloaded")


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    fence_match = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", cleaned, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return cleaned


def _fill_prompt_template(template: str, **values: str) -> str:
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{key}}}", value)
    return result

MAX_SUMMARY_INPUT_CHARS = 100_000

SUMMARY_HEADER = re.compile(r"^##\s*סיכום(?:\s*ונקודות מפתח)?", re.MULTILINE)
PDF_DIFF_HEADER = re.compile(r"^##\s*📋\s*נושאים מהמצגת", re.MULTILINE)

SUMMARY_SYSTEM_PROMPT = """You write the CLOSING SUMMARY section for Hebrew university lecture notebooks.
You read the full notebook and produce a structured, exam-ready recap.
Every bullet must be grounded in specific content from that notebook.
Respond ONLY with the summary section Markdown. No preamble."""

SUMMARY_USER_TEMPLATE = """## Full lecture notebook (source of truth — read entirely before writing):
{notebook_body}

## Your task
Write ONLY the section below. This is the student's final review before an exam.

## סיכום ונקודות מפתח

Use EXACTLY these four subsections, in this order, with substantive bullets.

### מושגים ועקרונות מרכזיים
- 8–14 bullets
- Each bullet: **מונח בעברית (English if standard)** — הסבר מדויק ב-1–2 משפטים
- Include every major definition and framework taught in this lecture

### הבחנות וטיעונים חשובים
- 5–10 bullets
- Format: **X לעומת Y** — מה ההבדל ולמה זה משנה; or: תנאי/סיבה → מסקנה
- Capture debates, ethical tensions, pro/con arguments from the lecture

### דוגמאות ומקרים מההרצאה
- 4–8 bullets
- Name the case/example (חוק, חברה, תרחיש, מחקר) + what happened + the lesson drawn
- Enough detail that a student can retell the example in an exam

### נקודות למבחן
- 8–12 bullets
- Testable claims, lists to memorize, "שאלה צפויה: ...", common mistakes to avoid
- Include formulas, legal tests, or criteria if the lecture has them

## Quality rules (mandatory)
1. NO generic bullets that could fit any course (e.g. "חשוב להבין את החומר", "יש להכיר את המושגים").
2. NO inventing topics not in the notebook.
3. Every bullet must name at least one specific term, case, law, theorist, or distinction from THIS lecture.
4. Hebrew RTL; keep standard English academic terms inline.
5. Do NOT repeat the lecture title as a bullet. Do NOT copy sentences verbatim from the body — synthesize.
6. Output ONLY from `## סיכום ונקודות מפתח` through the last bullet of `### נקודות למבחן` — no PDF diff section."""


def _truncate_for_summary(notebook_body: str) -> str:
    if len(notebook_body) <= MAX_SUMMARY_INPUT_CHARS:
        return notebook_body
    half = MAX_SUMMARY_INPUT_CHARS // 2
    return (
        notebook_body[:half]
        + "\n\n[... אמצע המחברת הושמט בגלל אורך — הסיכום מבוסס על תחילת וסוף המחברת ...]\n\n"
        + notebook_body[-half:]
    )


def split_body_and_tail(content: str) -> tuple[str, str]:
    """Return (body_before_summary, tail_from_pdf_diff_or_empty)."""
    pdf_match = PDF_DIFF_HEADER.search(content)
    if pdf_match:
        before_pdf = content[: pdf_match.start()].rstrip()
        tail = content[pdf_match.start() :].strip()
    else:
        before_pdf = content.rstrip()
        tail = ""

    summary_match = SUMMARY_HEADER.search(before_pdf)
    if summary_match:
        body = before_pdf[: summary_match.start()].rstrip()
    else:
        body = before_pdf
    return body, tail


def merge_summary_into_notebook(body: str, summary_section: str, tail: str) -> str:
    parts = [body.rstrip(), summary_section.strip()]
    if tail:
        parts.append(tail.strip())
    return "\n\n".join(parts) + "\n"


def _call_summary_gemini(client, model_name: str, user_prompt: str, lecture_path: Path):
    import time

    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            return client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(system_instruction=SUMMARY_SYSTEM_PROMPT),
            )
        except Exception as exc:
            error_str = str(exc)
            is_retriable = any(s in error_str for s in _RETRIABLE_STRINGS)
            if not is_retriable or attempt >= len(_RETRY_DELAYS):
                raise
            time.sleep(_RETRY_DELAYS[attempt])
    raise RuntimeError("Gemini summary retry limit reached")


def generate_closing_summary(lecture_path: Path, notebook_content: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    body, _tail = split_body_and_tail(notebook_content)
    if not body.strip():
        raise RuntimeError("Notebook body is empty — cannot generate summary")

    user_prompt = _fill_prompt_template(
        SUMMARY_USER_TEMPLATE,
        notebook_body=_truncate_for_summary(body),
    )

    model_name = resolve_gemini_model()
    log_pipeline(lecture_path, f"Generating closing summary (second pass, {model_name})")

    client = get_client()
    response = _call_summary_gemini(client, model_name, user_prompt, lecture_path)
    if not response.text:
        raise RuntimeError("Gemini returned empty summary response")

    summary = _strip_code_fences(response.text).strip()
    if not SUMMARY_HEADER.search(summary):
        summary = f"## סיכום ונקודות מפתח\n\n{summary}"
    return summary


def refresh_closing_summary(lecture_path: Path, notebook_content: str) -> str:
    """Replace the closing summary section with a dedicated second-pass generation."""
    body, tail = split_body_and_tail(notebook_content)
    summary = generate_closing_summary(lecture_path, notebook_content)
    merged = merge_summary_into_notebook(body, summary, tail)
    log_pipeline(lecture_path, "Closing summary refreshed (second Gemini pass)")
    return merged
