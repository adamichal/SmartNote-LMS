"""Validate slide image references against manifest previews."""

from __future__ import annotations

import json
import re
from pathlib import Path

IMAGE_REF_PATTERN = re.compile(
    r"!\[([^\]]*)\]\((?:\./)?extracted_images/([^)]+)\)",
    re.IGNORECASE,
)

NON_CONTENT_SLIDE = re.compile(
    r"(?i)(thank\s*you|thanks|תודה|questions?\??|שאלות|any\s*questions|"
    r"the\s*end|סוף|להתראות|see\s*you|bibliography|references|מקורות|"
    r"copyright|all\s*rights)"
)

WORD_PATTERN = re.compile(r"[\w\u0590-\u05FF]+", re.UNICODE)


def _load_manifest(images_dir: Path) -> list[dict]:
    manifest_path = images_dir / "manifest.json"
    if not manifest_path.exists():
        return []
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def preview_by_filename(images_dir: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for entry in _load_manifest(images_dir):
        file_name = entry.get("file", "")
        preview = (entry.get("preview") or "").strip()
        if file_name:
            result[file_name.lower()] = preview
    return result


def is_non_content_slide(preview: str) -> bool:
    text = (preview or "").strip()
    if not text:
        return True
    if NON_CONTENT_SLIDE.search(text):
        return True
    words = WORD_PATTERN.findall(text)
    if len(text) < 30 and len(words) <= 5 and not re.search(r"\d", text):
        return True
    return False


def _word_set(text: str) -> set[str]:
    return {word.lower() for word in WORD_PATTERN.findall(text) if len(word) > 1}


def caption_matches_preview(alt: str, preview: str) -> bool:
    alt_clean = (alt or "").strip()
    preview_clean = (preview or "").strip()
    if not preview_clean:
        return True
    if not alt_clean:
        return False
    if alt_clean.lower() in preview_clean.lower() or preview_clean.lower() in alt_clean.lower():
        return True
    alt_words = _word_set(alt_clean)
    preview_words = _word_set(preview_clean)
    if not preview_words:
        return True
    overlap = alt_words & preview_words
    if len(preview_words) <= 4:
        return bool(overlap)
    return len(overlap) >= max(2, len(preview_words) // 5)


def _caption_from_preview(preview: str, max_len: int = 90) -> str:
    text = " ".join(preview.split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def sanitize_slide_images_in_markdown(content: str, images_dir: Path) -> str:
    previews = preview_by_filename(images_dir)

    def replace_match(match: re.Match) -> str:
        alt = match.group(1).strip()
        raw_name = match.group(2).strip()
        file_key = Path(raw_name).name.lower()
        preview = previews.get(file_key, "")

        if is_non_content_slide(preview):
            return ""

        if not preview:
            return match.group(0)

        if caption_matches_preview(alt, preview):
            safe_alt = _caption_from_preview(preview) if not alt else alt
            return f"![{safe_alt}](./extracted_images/{Path(raw_name).name})"

        fixed_alt = _caption_from_preview(preview)
        return f"![{fixed_alt}](./extracted_images/{Path(raw_name).name})"

    cleaned = IMAGE_REF_PATTERN.sub(replace_match, content)
    return re.sub(r"\n{3,}", "\n\n", cleaned)
