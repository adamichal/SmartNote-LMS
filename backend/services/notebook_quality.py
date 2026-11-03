"""Post-generation quality checks for notebook drafts."""

from __future__ import annotations

import re
from pathlib import Path

from backend.services.job_status import log_pipeline
from backend.services.notebook_coverage import (
    topics_from_manifest,
    topics_from_pdf_text,
)

_H2_PATTERN = re.compile(r"^##\s+(?!🔗|פתיחה|סיכום|📋|תרגול)(.+)$", re.MULTILINE)
_DEFINITION_PATTERN = re.compile(r"^>\s*\*\*הגדרה", re.MULTILINE)
_IMAGE_PATTERN = re.compile(r"!\[[^\]]*\]\([^)]*extracted_images/", re.IGNORECASE)


def _mentioned_ratio(notebook: str, topics: list[str]) -> float:
    if not topics:
        return 1.0
    body = notebook.casefold()
    hits = 0
    for topic in topics:
        words = [w for w in re.findall(r"[\w\u0590-\u05FF]+", topic) if len(w) >= 3]
        if not words:
            continue
        if any(word.casefold() in body for word in words[:3]):
            hits += 1
    return hits / len(topics)


def audit_notebook_draft(
    lecture_path: Path,
    notebook: str,
    transcript: str,
    pdf_text: str,
) -> list[str]:
    """Return human-readable warnings (empty = no major issues)."""
    warnings: list[str] = []
    notebook = notebook.strip()
    transcript = transcript.strip()

    if len(notebook) < 2000:
        warnings.append(f"מחברת קצרה מאוד ({len(notebook)} תווים) — ייתכן שחסר חומר.")

    if transcript:
        ratio = len(notebook) / max(len(transcript), 1)
        if ratio < 0.3:
            warnings.append(
                f"יחס אורך מחברת/תמלול נמוך ({ratio:.2f}) — ייתכן דחיסה מוגזמת."
            )

    h2_count = len(_H2_PATTERN.findall(notebook))
    if h2_count < 3:
        warnings.append(f"מעט מדי נושאים ראשיים (##): {h2_count} — בדוק מבנה.")

    if re.search(r"^##\s*סיכום", notebook, re.MULTILINE):
        warnings.append("המחברת מכילה סיכום מוטמע — הסיכום נוצר בנפרד ב-exam_summary.md.")

    def_count = len(_DEFINITION_PATTERN.findall(notebook))
    if def_count < 2:
        warnings.append(f"מעט הגדרות מסומנות ({def_count}) — הוסף blockquotes להגדרות.")

    image_count = len(_IMAGE_PATTERN.findall(notebook))
    if image_count < 2:
        warnings.append("מעט תמונות שקפים — שקול להטמיע יותר שקפים רלוונטיים.")

    topics = topics_from_manifest(lecture_path)
    if len(topics) < 3 and pdf_text:
        topics = topics_from_pdf_text(pdf_text)
    if topics:
        coverage = _mentioned_ratio(notebook, topics)
        if coverage < 0.55:
            warnings.append(
                f"כיסוי נושאי מצגת נמוך ({coverage:.0%}) — ייתכן שנושאי שקף חסרים."
            )

    return warnings


def log_notebook_quality(
    lecture_path: Path,
    notebook: str,
    transcript: str,
    pdf_text: str,
) -> list[str]:
    warnings = audit_notebook_draft(lecture_path, notebook, transcript, pdf_text)
    if warnings:
        log_pipeline(
            lecture_path,
            "אזהרות איכות מחברת: " + " | ".join(warnings),
        )
    else:
        log_pipeline(lecture_path, "בדיקת איכות מחברת — ללא אזהרות משמעותיות")
    return warnings
