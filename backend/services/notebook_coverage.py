"""Build a topic checklist from presentation slides for completeness guidance."""

from __future__ import annotations

import json
import re
from pathlib import Path

from backend.services.notebook_images import is_non_content_slide

_PRESENTATION_HEADER = re.compile(r"^###\s+(.+)$", re.MULTILINE)
_PDF_PAGE_HEADER = re.compile(r"^--- PDF page \d+ \(([^)]+)\) ---$", re.MULTILINE)


def _load_manifest(lecture_path: Path) -> list[dict]:
    manifest_path = lecture_path / "extracted_images" / "manifest.json"
    if not manifest_path.exists():
        return []
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def _presentation_pdfs(manifest: list[dict]) -> set[str]:
    names: set[str] = set()
    for entry in manifest:
        pdf_name = entry.get("pdf", "")
        if not pdf_name:
            continue
        if pdf_name == "presentation.pdf" or (
            pdf_name.startswith("presentation_") and pdf_name.endswith(".pdf")
        ):
            names.add(pdf_name)
    return names


def _topic_from_preview(preview: str) -> str | None:
    text = " ".join((preview or "").split()).strip()
    if not text or is_non_content_slide(text):
        return None
    if len(text) > 120:
        text = text[:117].rstrip() + "..."
    return text


def topics_from_manifest(lecture_path: Path) -> list[str]:
    manifest = _load_manifest(lecture_path)
    if not manifest:
        return []

    presentation_names = _presentation_pdfs(manifest)
    seen: set[str] = set()
    topics: list[str] = []

    for entry in manifest:
        pdf_name = entry.get("pdf", "")
        if presentation_names and pdf_name not in presentation_names:
            continue
        topic = _topic_from_preview(entry.get("preview", ""))
        if not topic:
            continue
        key = topic.casefold()
        if key in seen:
            continue
        seen.add(key)
        topics.append(topic)
    return topics


def topics_from_pdf_text(pdf_text: str) -> list[str]:
    """Fallback headings when manifest is missing."""
    if not pdf_text.strip():
        return []

    topics: list[str] = []
    seen: set[str] = set()

    for match in _PRESENTATION_HEADER.finditer(pdf_text):
        label = match.group(1).strip()
        if label and label.casefold() not in seen:
            seen.add(label.casefold())
            topics.append(label)

    for block in re.split(r"\n--- PDF page \d+[^-]*---\n", pdf_text):
        first_line = next((ln.strip() for ln in block.splitlines() if ln.strip()), "")
        if not first_line or len(first_line) < 4:
            continue
        if is_non_content_slide(first_line):
            continue
        if len(first_line) > 100:
            first_line = first_line[:97].rstrip() + "..."
        key = first_line.casefold()
        if key not in seen:
            seen.add(key)
            topics.append(first_line)

    return topics[:40]


def build_topic_checklist(lecture_path: Path, pdf_text: str = "") -> str:
    """Markdown checklist injected into the Gemini prompt."""
    topics = topics_from_manifest(lecture_path)
    if len(topics) < 3 and pdf_text:
        for topic in topics_from_pdf_text(pdf_text):
            if topic not in topics:
                topics.append(topic)

    if not topics:
        return (
            "(לא זוהו כותרות שקפים — ודא שכל נושא, דוגמה והבחנה מהתמלול "
            "ומחומרי המקור מופיעים במחברת.)"
        )

    lines = [
        "לפני שאתה מסיים — ודא שכל הנושאים הבאים (משקפי המצגת) מכוסים "
        "בגוף המחברת, עם הסבר מלא ולא רק אזכור:",
        "",
    ]
    for topic in topics:
        lines.append(f"- [ ] {topic}")
    lines.append("")
    lines.append(
        f"סה\"כ {len(topics)} נושאי שקף. אם נושא לא נדון בהרצאה — ציין זאת "
        "בסעיף «נושאים מהמצגת שלא נדונו»."
    )
    return "\n".join(lines)
