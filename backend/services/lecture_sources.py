"""Scan and persist lecture source-file metadata."""

from __future__ import annotations

import json
from pathlib import Path

MEDIA_NAMES = {"lecture.mp4", "lecture.mp3"}
PRESENTATION_NAMES = ("presentation.pdf",)
SOURCE_MANIFEST = "sources.json"

CATEGORY_LABELS = {
    "media": "מדיה",
    "presentation": "מצגת",
    "transcript": "תמלול",
    "extra": "חומר נוסף",
}


def _file_entry(path: Path, category: str, original_name: str | None = None) -> dict:
    return {
        "category": category,
        "filename": path.name,
        "original_name": original_name or path.name,
        "extension": path.suffix.lower(),
        "size_bytes": path.stat().st_size,
    }


def scan_lecture_sources(lecture_path: Path) -> dict:
    manifest_path = lecture_path / SOURCE_MANIFEST
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    items: list[dict] = []
    raw_media = lecture_path / "raw_media"
    transcripts = lecture_path / "transcripts"

    if raw_media.is_dir():
        for path in sorted(raw_media.iterdir()):
            if not path.is_file():
                continue
            name = path.name
            if name in MEDIA_NAMES:
                items.append(_file_entry(path, "media"))
            elif name == "presentation.pdf" or (
                name.startswith("presentation_") and name.endswith(".pdf")
            ):
                items.append(_file_entry(path, "presentation"))
            elif name.startswith("extra_material_"):
                items.append(_file_entry(path, "extra"))

    transcript_path = transcripts / "raw_transcript.txt"
    if transcript_path.is_file() and transcript_path.stat().st_size > 0:
        items.append(_file_entry(transcript_path, "transcript"))

    return {"items": items}


def write_sources_manifest(lecture_path: Path, items: list[dict]) -> None:
    manifest = {"items": items}
    (lecture_path / SOURCE_MANIFEST).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def sources_summary(items: list[dict]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for item in items:
        category = item.get("category", "extra")
        summary[category] = summary.get(category, 0) + 1
    return summary
