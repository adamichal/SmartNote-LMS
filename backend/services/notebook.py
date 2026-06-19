import json
import re
from pathlib import Path

from backend.services.job_status import log_pipeline, write_job_status

IMAGE_REF_PATTERN = re.compile(
    r"!\[([^\]]*)\]\(\./extracted_images/([^)]+)\)",
    re.IGNORECASE,
)
LEGACY_SLIDE_REF_PATTERN = re.compile(
    r"!\[[^\]]*\]\(\./extracted_images/slide_[^)]+\)\s*",
    re.IGNORECASE,
)


def _strip_legacy_slide_refs(content: str) -> str:
    cleaned = LEGACY_SLIDE_REF_PATTERN.sub("", content)
    return re.sub(r"\n{3,}", "\n\n", cleaned)


def _list_notebook_images(images_dir: Path) -> list[Path]:
    if not images_dir.exists():
        return []
    files = list(images_dir.glob("page_*.png")) + list(images_dir.glob("slide_*.png"))
    return sorted({path.name: path for path in files}.values())


def _image_exists(images_dir: Path, filename: str) -> bool:
    return (images_dir / filename).is_file()


def strip_invalid_image_refs(content: str, images_dir: Path) -> str:
    """Remove image markdown when the referenced file does not exist."""
    content = _strip_legacy_slide_refs(content)

    def replace_match(match: re.Match) -> str:
        filename = match.group(2).strip()
        if filename.upper() == "PLACEHOLDER.PNG":
            return ""
        if _image_exists(images_dir, filename):
            return match.group(0)
        return ""

    cleaned = IMAGE_REF_PATTERN.sub(replace_match, content)
    return re.sub(r"\n{3,}", "\n\n", cleaned)


PLACEHOLDER_PATTERN = re.compile(
    r"!\[([^\]]*)\]\(\./extracted_images/PLACEHOLDER\.png\)",
    re.IGNORECASE,
)


def _resolve_placeholders(content: str, images_dir: Path) -> str:
    """Drop unresolved PLACEHOLDER.png entries."""
    return PLACEHOLDER_PATTERN.sub("", content)


def assemble_notebook(lecture_path: Path) -> Path:
    final_path = lecture_path / "final_notebook.md"
    if final_path.exists() and final_path.stat().st_size > 0:
        log_pipeline(lecture_path, "Notebook assembly skipped — final_notebook.md already exists")
        return final_path

    draft_path = lecture_path / "transcripts" / "ai_draft.md"
    if not draft_path.exists():
        raise FileNotFoundError("ai_draft.md not found — run AI editing first")

    write_job_status(
        lecture_path,
        status="processing",
        stage="notebook_assembly",
        progress_pct=90,
        error=None,
    )

    draft_content = draft_path.read_text(encoding="utf-8")
    images_dir = lecture_path / "extracted_images"

    assembled = _resolve_placeholders(draft_content, images_dir)
    assembled = strip_invalid_image_refs(assembled, images_dir)
    final_path.write_text(assembled, encoding="utf-8")

    valid_refs = len(_list_notebook_images(images_dir))
    log_pipeline(
        lecture_path,
        f"Notebook assembled — {valid_refs} slide images available, saved to final_notebook.md",
    )
    write_job_status(
        lecture_path,
        status="processing",
        stage="notebook_assembly",
        progress_pct=98,
        error=None,
    )
    return final_path


def read_notebook(lecture_path: Path) -> str:
    notebook_path = lecture_path / "final_notebook.md"
    if not notebook_path.exists():
        raise FileNotFoundError("final_notebook.md not found")

    images_dir = lecture_path / "extracted_images"
    content = notebook_path.read_text(encoding="utf-8")
    cleaned = strip_invalid_image_refs(content, images_dir)
    if cleaned != content:
        notebook_path.write_text(cleaned, encoding="utf-8")
        log_pipeline(lecture_path, "Removed invalid image references from final_notebook.md")
    return cleaned


def save_notebook(lecture_path: Path, content: str) -> None:
    notebook_path = lecture_path / "final_notebook.md"
    notebook_path.write_text(content, encoding="utf-8")


def build_slide_catalog(lecture_path: Path) -> str:
    images_dir = lecture_path / "extracted_images"
    manifest_path = images_dir / "manifest.json"
    if not manifest_path.exists():
        return "No slide images extracted yet."

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not manifest:
        return "No slide images extracted yet."

    lines = []
    for entry in manifest:
        page_label = entry["page"] + 1
        preview = entry.get("preview", "").strip()
        if preview:
            lines.append(f"- `{entry['file']}` (PDF page {page_label}): {preview}")
        else:
            lines.append(f"- `{entry['file']}` (PDF page {page_label})")
    return "\n".join(lines)
