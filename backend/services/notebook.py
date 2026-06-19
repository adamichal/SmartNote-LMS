import re
from pathlib import Path

from backend.services.job_status import log_pipeline, write_job_status

PLACEHOLDER_PATTERN = re.compile(
    r"!\[([^\]]*)\]\(\./extracted_images/PLACEHOLDER\.png\)",
    re.IGNORECASE,
)


def _replace_image_placeholders(content: str, images: list[Path]) -> str:
    image_iter = iter(images)

    def replace_match(match: re.Match) -> str:
        try:
            image = next(image_iter)
            return f"![{match.group(1)}](./extracted_images/{image.name})"
        except StopIteration:
            return match.group(0)

    updated = PLACEHOLDER_PATTERN.sub(replace_match, content)

    # Replace any remaining bare PLACEHOLDER.png references in order.
    for image in images:
        if "PLACEHOLDER.png" not in updated:
            break
        updated = updated.replace("PLACEHOLDER.png", image.name, 1)

    return updated


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
    images = sorted(images_dir.glob("slide_*.png")) if images_dir.exists() else []

    assembled = _replace_image_placeholders(draft_content, images)
    final_path.write_text(assembled, encoding="utf-8")

    log_pipeline(
        lecture_path,
        f"Notebook assembled — {len(images)} images mapped, saved to final_notebook.md",
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
    return notebook_path.read_text(encoding="utf-8")


def save_notebook(lecture_path: Path, content: str) -> None:
    notebook_path = lecture_path / "final_notebook.md"
    notebook_path.write_text(content, encoding="utf-8")
