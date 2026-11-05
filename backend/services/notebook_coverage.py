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


def is_presentation_pdf(pdf_name: str) -> bool:
    return pdf_name == "presentation.pdf" or (
        pdf_name.startswith("presentation_") and pdf_name.endswith(".pdf")
    )


def _presentation_pdfs(manifest: list[dict]) -> set[str]:
    return {entry.get("pdf", "") for entry in manifest if is_presentation_pdf(entry.get("pdf", ""))}


_PAGE_BLOCK = re.compile(r"^--- PDF page (\d+) \((.+?)\) ---$", re.MULTILINE)


def _page_texts(pdf_text: str) -> dict[tuple[str, int], str]:
    """Full text per (pdf name, 1-based page) from pdf_text.txt."""
    texts: dict[tuple[str, int], str] = {}
    matches = list(_PAGE_BLOCK.finditer(pdf_text))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(pdf_text)
        # cut at the next "### section" header so it doesn't leak into the last page
        body = pdf_text[match.end():end].split("\n### ", 1)[0]
        texts[(match.group(2), int(match.group(1)))] = body.strip()
    return texts


def content_slides(lecture_path: Path) -> list[dict]:
    """Presentation slides worth covering, with their full text (same slide set as the topic checklist)."""
    manifest = _load_manifest(lecture_path)
    pdf_text_path = lecture_path / "transcripts" / "pdf_text.txt"
    pdf_text = pdf_text_path.read_text(encoding="utf-8") if pdf_text_path.is_file() else ""
    page_texts = _page_texts(pdf_text)
    presentation_names = _presentation_pdfs(manifest)

    slides: list[dict] = []
    seen: set[str] = set()
    for entry in manifest:
        pdf_name = entry.get("pdf", "")
        if presentation_names and pdf_name not in presentation_names:
            continue
        preview = " ".join((entry.get("preview") or "").split())
        if is_non_content_slide(preview):
            continue
        page = int(entry.get("page", 0)) + 1
        text = page_texts.get((pdf_name, page)) or preview
        # animation builds repeat the same slide text — count it once
        key = " ".join(text.split()).casefold()
        if key in seen:
            continue
        seen.add(key)
        slides.append(
            {"file": entry.get("file", ""), "pdf": pdf_name, "page": page, "preview": preview[:120], "text": text}
        )
    return slides


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
