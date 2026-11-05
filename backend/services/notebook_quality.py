"""Post-generation quality checks for notebook drafts."""

from __future__ import annotations

import re
from pathlib import Path

from backend.services.job_status import log_pipeline

_H2_PATTERN = re.compile(r"^##\s+(?!🔗|פתיחה|סיכום|📋|תרגול)(.+)$", re.MULTILINE)
_DEFINITION_PATTERN = re.compile(r"^>\s*\*\*הגדרה", re.MULTILINE)
_IMAGE_PATTERN = re.compile(r"!\[[^\]]*\]\([^)]*extracted_images/", re.IGNORECASE)


def structure_warnings(notebook: str, transcript: str) -> list[str]:
    """Shape-of-the-notebook warnings (length, sections, definitions, images)."""
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

    return warnings


def audit_notebook_draft(
    lecture_path: Path,
    notebook: str,
    transcript: str,
    pdf_text: str,
) -> list[str]:
    """Return human-readable warnings (empty = no major issues)."""
    from backend.services.notebook_coverage import content_slides
    from backend.services.quality_checks import (
        COVERAGE_REVIEW_BELOW,
        MIN_SLIDES_FOR_LEVEL,
        check_slide_coverage,
    )

    warnings = structure_warnings(notebook, transcript)

    # per-slide coverage (the full report with the uncovered slides is written after assembly)
    coverage = check_slide_coverage(content_slides(lecture_path), notebook)
    enough_slides = coverage["slides_checked"] >= MIN_SLIDES_FOR_LEVEL
    if enough_slides and coverage["score"] < COVERAGE_REVIEW_BELOW:
        warnings.append(
            f"כיסוי שקפים נמוך ({coverage['score']:.0%}) — "
            f"{len(coverage['uncovered'])} שקפים לא מכוסים."
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
