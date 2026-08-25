import json
import re
from pathlib import Path

from backend.services.exam_summary import refresh_exam_summary
from backend.services.job_status import log_pipeline, write_job_status
from backend.services.notebook_format import format_notebook_content
from backend.services.notebook_images import is_non_content_slide, sanitize_slide_images_in_markdown
from backend.services.notebook_styling import enrich_notebook_markdown

IMAGE_REF_PATTERN = re.compile(
    r"!\[([^\]]*)\]\((?:\./)?extracted_images/([^)]+)\)",
    re.IGNORECASE,
)
BARE_IMAGE_REF_PATTERN = re.compile(
    r"!\[([^\]]*)\]\((page_\d+\.png|slide_\d+\.png)\)",
    re.IGNORECASE,
)


def normalize_image_filename(filename: str, images_dir: Path) -> str | None:
    name = (filename or "").strip().replace("\\", "/").split("/")[-1]
    if not name or name.upper() == "PLACEHOLDER.PNG":
        return None
    if _image_exists(images_dir, name):
        return name

    page_match = re.match(r"^page_(\d+)\.png$", name, re.IGNORECASE)
    if page_match:
        padded = f"page_{int(page_match.group(1)):03d}.png"
        if _image_exists(images_dir, padded):
            return padded

    slide_match = re.match(r"^slide_(\d+)\.png$", name, re.IGNORECASE)
    if slide_match:
        padded = f"page_{int(slide_match.group(1)):03d}.png"
        if _image_exists(images_dir, padded):
            return padded

    page_num_match = re.search(r"page_(\d+)\.png$", name, re.IGNORECASE)
    if page_num_match and images_dir.exists():
        page_num = int(page_num_match.group(1))
        suffix = f"page_{page_num:03d}.png"
        candidates = sorted(
            candidate.name
            for candidate in images_dir.glob("*.png")
            if candidate.name.lower().endswith(suffix.lower())
        )
        if len(candidates) == 1:
            return candidates[0]
        plain = suffix
        if plain in candidates:
            return plain
        if candidates:
            return candidates[0]

    if images_dir.exists():
        lowered = name.lower()
        for candidate in images_dir.glob("*.png"):
            if candidate.name.lower() == lowered:
                return candidate.name

    return None


def normalize_image_refs_in_markdown(content: str, images_dir: Path) -> str:
    def replace_match(match: re.Match) -> str:
        alt = match.group(1)
        raw_name = match.group(2).strip()
        normalized = normalize_image_filename(raw_name, images_dir)
        if not normalized:
            return ""
        return f"![{alt}](./extracted_images/{normalized})"

    content = BARE_IMAGE_REF_PATTERN.sub(replace_match, content)
    cleaned = IMAGE_REF_PATTERN.sub(replace_match, content)
    return re.sub(r"\n{3,}", "\n\n", cleaned)


def _list_notebook_images(images_dir: Path) -> list[Path]:
    if not images_dir.exists():
        return []
    return sorted(images_dir.glob("*.png"), key=lambda path: path.name.lower())


def _image_exists(images_dir: Path, filename: str) -> bool:
    return (images_dir / filename).is_file()


def strip_invalid_image_refs(content: str, images_dir: Path) -> str:
    """Remove image markdown when the referenced file does not exist."""
    content = normalize_image_refs_in_markdown(content, images_dir)

    def replace_match(match: re.Match) -> str:
        filename = match.group(2).strip()
        if normalize_image_filename(filename, images_dir):
            return match.group(0)
        return ""

    def replace_bare(match: re.Match) -> str:
        filename = match.group(2).strip()
        if normalize_image_filename(filename, images_dir):
            return match.group(0)
        return ""

    cleaned = BARE_IMAGE_REF_PATTERN.sub(replace_bare, content)
    cleaned = IMAGE_REF_PATTERN.sub(replace_match, cleaned)
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
    assembled = normalize_image_refs_in_markdown(assembled, images_dir)
    assembled = sanitize_slide_images_in_markdown(assembled, images_dir)
    assembled = strip_invalid_image_refs(assembled, images_dir)
    assembled = enrich_notebook_markdown(assembled)
    final_path.write_text(assembled, encoding="utf-8")

    try:
        refresh_exam_summary(lecture_path, assembled)
    except Exception as exc:
        log_pipeline(lecture_path, f"Exam summary generation failed (notebook saved): {exc}")

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
    formatted = format_notebook_content(cleaned)
    formatted = sanitize_slide_images_in_markdown(formatted, images_dir)
    if formatted != content:
        notebook_path.write_text(formatted, encoding="utf-8")
        log_pipeline(lecture_path, "Notebook formatted (metadata cleanup)")
    return formatted


def save_notebook(lecture_path: Path, content: str) -> None:
    notebook_path = lecture_path / "final_notebook.md"
    images_dir = lecture_path / "extracted_images"
    content = enrich_notebook_markdown(content)
    content = normalize_image_refs_in_markdown(content, images_dir)
    content = sanitize_slide_images_in_markdown(content, images_dir)
    content = strip_invalid_image_refs(content, images_dir)
    notebook_path.write_text(content, encoding="utf-8")


def _is_presentation_pdf(pdf_name: str) -> bool:
    return pdf_name == "presentation.pdf" or (
        pdf_name.startswith("presentation_") and pdf_name.endswith(".pdf")
    )


def build_slide_catalog(lecture_path: Path, *, presentations_only: bool = False) -> str:
    images_dir = lecture_path / "extracted_images"
    manifest_path = images_dir / "manifest.json"
    if not manifest_path.exists():
        return "No slide images extracted yet."

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not manifest:
        return "No slide images extracted yet."

    lines = [
        "Slide images from MAIN PRESENTATION PDFs only.",
        "Each entry shows PREVIEW = literal text extracted from that slide.",
        "",
        "CRITICAL IMAGE RULES FOR YOU:",
        "1. Use ONLY slides listed under 'USABLE SLIDES'.",
        "2. Image alt text MUST describe what PREVIEW says — do NOT invent charts/graphs/content.",
        "3. If PREVIEW is unrelated to your paragraph, do NOT insert that image nearby.",
        "4. Never use a closing/title slide as if it were a data chart.",
        "",
    ]
    usable: list[str] = []
    skipped: list[str] = []
    for entry in manifest:
        pdf_name = entry.get("pdf", "")
        if presentations_only and not _is_presentation_pdf(pdf_name):
            continue
        page_label = entry["page"] + 1
        preview = entry.get("preview", "").strip()
        file_name = entry["file"]
        if is_non_content_slide(preview):
            skipped.append(f"- `{file_name}` (page {page_label}): \"{preview}\" — DO NOT USE (no content)")
            continue
        preview_display = preview or "(no text on slide)"
        usable.append(
            f"- `{file_name}` (page {page_label})\n"
            f"  PREVIEW: \"{preview_display}\"\n"
            f"  → `![{preview_display[:80]}](./extracted_images/{file_name})`"
        )
    if not usable:
        lines.append("No usable presentation slides with educational visuals.")
    else:
        lines.append("USABLE SLIDES:")
        lines.extend(usable)
    if skipped:
        lines.append("")
        lines.append("SKIP (do not embed):")
        lines.extend(skipped)
    return "\n".join(lines)
