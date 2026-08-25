"""Add summary / course placement / exam sections to existing notebooks without rewriting."""

import re
from pathlib import Path

from google.genai import types

from backend.config import GEMINI_API_KEY
from backend.services.course_context import build_course_context_for_lecture
from backend.services.filesystem import get_course_path_or_404, list_lectures, parse_lecture_folder
from backend.services.gemini import (
    _RETRIABLE_STRINGS,
    _RETRY_DELAYS,
    _fill_prompt_template,
    _strip_code_fences,
)
from backend.services.gemini_utils import get_client, resolve_gemini_model
from backend.services.notebook import read_notebook, save_notebook
from backend.services.notebook_styling import enrich_notebook_markdown

SECTION_SUMMARY = "summary"
SECTION_PLACEMENT = "placement"
SECTION_EXAM = "exam"

_SECTION_LABELS = {
    SECTION_SUMMARY: "## סיכום מהיר",
    SECTION_PLACEMENT: "## 🔗 מיקום בקורס",
    SECTION_EXAM: "## 💡 נקודות למבחן",
}

_SYSTEM_INSTRUCTION = """You are an expert academic editor for Hebrew study notebooks.
You receive an existing notebook and course context.
Your job is to write ONLY the requested supplemental sections.
Respond ONLY with Markdown for those sections. No preamble."""

_USER_TEMPLATE = """## Existing notebook (DO NOT rewrite — read only):
{notebook}

## Course context (for placement / cross-references only):
{course_context}

## Sections to generate:
{section_list}

## Rules:
1. Base every bullet on content from THIS notebook only — do not invent topics.
2. ## סיכום מהיר: 3–6 concise, exam-oriented bullet points of core ideas.
3. ## 🔗 מיקום בקורס: One short paragraph on where this lecture fits (prerequisites, what it builds on, what comes next). Use course context for cross-refs only.
4. ## 💡 נקודות למבחן: Bullet list of the most testable concepts, distinctions, and formulas from this lecture.
5. Hebrew RTL. Keep English terms inline where appropriate.
6. Output ONLY the requested section headings and their content, in order.

## Output format (include only requested sections):
## סיכום מהיר
- ...

## 🔗 מיקום בקורס
...

## 💡 נקודות למבחן
- ..."""


def notebook_missing_sections(content: str) -> list[str]:
    missing: list[str] = []
    if not re.search(r"^##\s*סיכום מהיר", content, re.MULTILINE):
        missing.append(SECTION_SUMMARY)
    if "מיקום בקורס" not in content:
        missing.append(SECTION_PLACEMENT)
    if not re.search(r"נקודות למבחן", content):
        missing.append(SECTION_EXAM)
    return missing


def _parse_generated_sections(text: str, requested: list[str]) -> dict[str, str]:
    cleaned = _strip_code_fences(text)
    sections: dict[str, str] = {}

    if SECTION_SUMMARY in requested:
        match = re.search(
            r"^##\s*סיכום מהיר\s*\n(.*?)(?=\n## |\Z)",
            cleaned,
            re.MULTILINE | re.DOTALL,
        )
        if match:
            sections[SECTION_SUMMARY] = f"## סיכום מהיר\n{match.group(1).strip()}"

    if SECTION_PLACEMENT in requested:
        match = re.search(
            r"^##\s*(?:🔗\s*)?מיקום בקורס\s*\n(.*?)(?=\n## |\Z)",
            cleaned,
            re.MULTILINE | re.DOTALL,
        )
        if match:
            sections[SECTION_PLACEMENT] = f"## 🔗 מיקום בקורס\n{match.group(1).strip()}"

    if SECTION_EXAM in requested:
        match = re.search(
            r"^##\s*(?:💡\s*)?נקודות למבחן\s*\n(.*?)(?=\n## |\Z)",
            cleaned,
            re.MULTILINE | re.DOTALL,
        )
        if match:
            sections[SECTION_EXAM] = f"## 💡 נקודות למבחן\n{match.group(1).strip()}"

    return sections


def _call_sections_gemini(client, model_name: str, user_prompt: str, lecture_path: Path):
    import time

    from backend.services.job_status import log_pipeline

    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            return client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(system_instruction=_SYSTEM_INSTRUCTION),
            )
        except Exception as exc:
            error_str = str(exc)
            is_retriable = any(s in error_str for s in _RETRIABLE_STRINGS)
            if not is_retriable or attempt >= len(_RETRY_DELAYS):
                raise
            delay = _RETRY_DELAYS[attempt]
            log_pipeline(
                lecture_path,
                f"Section augment attempt {attempt + 1} failed — retrying in {delay}s",
            )
            time.sleep(delay)
    raise RuntimeError("Gemini retry limit reached")


def generate_missing_sections(
    lecture_path: Path,
    notebook_content: str,
    missing: list[str],
) -> dict[str, str]:
    if not missing:
        return {}
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    section_list = "\n".join(f"- {_SECTION_LABELS[key]}" for key in missing)
    course_context = build_course_context_for_lecture(lecture_path)
    user_prompt = _fill_prompt_template(
        _USER_TEMPLATE,
        notebook=notebook_content,
        course_context=course_context or "(אין הקשר קורס זמין)",
        section_list=section_list,
    )

    client = get_client()
    model_name = resolve_gemini_model()
    response = _call_sections_gemini(client, model_name, user_prompt, lecture_path)
    if not response.text:
        raise RuntimeError("Gemini returned empty response")

    parsed = _parse_generated_sections(response.text, missing)
    still_missing = [key for key in missing if key not in parsed]
    if still_missing:
        labels = ", ".join(_SECTION_LABELS[key] for key in still_missing)
        raise RuntimeError(f"Gemini response missing sections: {labels}")
    return parsed


def _header_insert_index(content: str) -> int:
    match = re.search(
        r"^#\s.+?\n(?:\*\*[^\n]+\n)+\n*---\s*\n",
        content,
        re.MULTILINE,
    )
    if match:
        return match.end()

    match = re.search(r"^---\s*\n", content, re.MULTILINE)
    if match:
        return match.end()

    return 0


def _insert_intro_sections(content: str, sections: dict[str, str]) -> str:
    intro_parts: list[str] = []
    if SECTION_SUMMARY in sections:
        intro_parts.append(sections[SECTION_SUMMARY])
    if SECTION_PLACEMENT in sections:
        intro_parts.append(sections[SECTION_PLACEMENT])
    if not intro_parts:
        return content

    intro_block = "\n\n".join(intro_parts) + "\n\n---\n\n"
    index = _header_insert_index(content)
    return content[:index] + intro_block + content[index:]


def _insert_exam_section(content: str, exam_section: str) -> str:
    pdf_diff = re.search(r"^##\s*📋\s*נושאים מהמצגת", content, re.MULTILINE)
    block = exam_section.strip() + "\n\n---\n\n"
    if pdf_diff:
        return content[: pdf_diff.start()] + block + content[pdf_diff.start() :]
    return content.rstrip() + "\n\n---\n\n" + block


def inject_missing_sections(content: str, sections: dict[str, str]) -> str:
    updated = content
    intro_keys = {SECTION_SUMMARY, SECTION_PLACEMENT}
    intro_sections = {key: sections[key] for key in intro_keys if key in sections}
    if intro_sections:
        updated = _insert_intro_sections(updated, intro_sections)
    if SECTION_EXAM in sections:
        updated = _insert_exam_section(updated, sections[SECTION_EXAM])
    return updated


def augment_lecture_notebook_sections(
    lecture_path: Path,
    *,
    dry_run: bool = False,
) -> dict:
    notebook_path = lecture_path / "final_notebook.md"
    if not notebook_path.exists():
        return {
            "lecture_id": lecture_path.name,
            "status": "skipped",
            "reason": "no notebook",
        }

    content = read_notebook(lecture_path)
    missing = notebook_missing_sections(content)
    updated = content

    if missing:
        generated = generate_missing_sections(lecture_path, content, missing)
        updated = inject_missing_sections(content, generated)

    styled = enrich_notebook_markdown(updated)

    if styled == content:
        return {
            "lecture_id": lecture_path.name,
            "status": "skipped",
            "reason": "already complete" if not missing else "no changes produced",
        }

    if not dry_run:
        save_notebook(lecture_path, styled)

    return {
        "lecture_id": lecture_path.name,
        "status": "updated" if not dry_run else "dry_run",
        "added": [_SECTION_LABELS[key] for key in missing],
        "styled": styled != updated,
    }


def augment_course_notebook_sections(
    course_name: str,
    *,
    dry_run: bool = False,
) -> list[dict]:
    course_path = get_course_path_or_404(course_name)
    lectures = list_lectures(course_name)
    results: list[dict] = []

    for lecture in lectures:
        lecture_path = course_path / lecture["id"]
        if not parse_lecture_folder(lecture["id"]):
            continue
        results.append(
            augment_lecture_notebook_sections(lecture_path, dry_run=dry_run)
        )

    return results
