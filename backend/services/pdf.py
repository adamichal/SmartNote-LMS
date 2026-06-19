import json
import shutil
from pathlib import Path

import fitz

from backend.services.job_status import log_pipeline, write_job_status

RENDER_MATRIX = fitz.Matrix(2, 2)
PREVIEW_CHARS = 140


def _collect_pdf_files(raw_media_dir: Path) -> list[Path]:
    pdfs: list[Path] = []
    presentation = raw_media_dir / "presentation.pdf"
    if presentation.exists():
        pdfs.append(presentation)
    pdfs.extend(sorted(raw_media_dir.glob("extra_material_*.pdf")))
    return pdfs


def _manifest_path(images_dir: Path) -> Path:
    return images_dir / "manifest.json"


def _load_manifest(images_dir: Path) -> list[dict]:
    path = _manifest_path(images_dir)
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _save_manifest(images_dir: Path, manifest: list[dict]) -> None:
    _manifest_path(images_dir).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _extract_pdf_pages(
    pdf_path: Path,
    images_dir: Path,
    manifest: list[dict],
) -> str:
    """Render every PDF page as a slide image and collect page text."""
    doc = fitz.open(pdf_path)
    text_parts: list[str] = []

    try:
        for page_num, page in enumerate(doc):
            page_text = page.get_text()
            page_label = page_num + 1
            page_name = f"page_{page_label:03d}.png"

            pix = page.get_pixmap(matrix=RENDER_MATRIX, alpha=False)
            pix.save(str(images_dir / page_name))

            preview = " ".join(page_text.split())[:PREVIEW_CHARS]
            manifest.append(
                {
                    "file": page_name,
                    "pdf": pdf_path.name,
                    "page": page_num,
                    "preview": preview,
                }
            )
            log_pipeline(
                images_dir.parent,
                f"Saved {page_name} from {pdf_path.name} (page {page_label})",
            )

            if page_text.strip():
                text_parts.append(f"--- PDF page {page_label} ({pdf_path.name}) ---\n{page_text}")
    finally:
        doc.close()

    label = "Presentation" if pdf_path.name == "presentation.pdf" else pdf_path.stem.replace("_", " ")
    section_text = "\n\n".join(text_parts)
    if not section_text.strip():
        return ""
    return f"### {label}\n{section_text}"


def process_pdf(lecture_path: Path) -> None:
    raw_media_dir = lecture_path / "raw_media"
    pdf_text_path = lecture_path / "transcripts" / "pdf_text.txt"
    images_dir = lecture_path / "extracted_images"
    marker_path = lecture_path / "transcripts" / ".pdf_processed"

    pdf_files = _collect_pdf_files(raw_media_dir)
    if not pdf_files:
        raise FileNotFoundError("No PDF files found in raw_media/")

    if marker_path.exists():
        log_pipeline(lecture_path, "PDF processing skipped — already processed")
        return

    write_job_status(
        lecture_path,
        status="processing",
        stage="pdf_processing",
        progress_pct=75,
        error=None,
    )

    images_dir.mkdir(parents=True, exist_ok=True)
    pdf_text_path.parent.mkdir(parents=True, exist_ok=True)

    combined_sections: list[str] = []
    manifest: list[dict] = []

    for pdf_path in pdf_files:
        section_text = _extract_pdf_pages(pdf_path, images_dir, manifest)
        if section_text:
            combined_sections.append(section_text)

    _save_manifest(images_dir, manifest)
    pdf_text_path.write_text("\n\n".join(combined_sections), encoding="utf-8")
    marker_path.write_text("done", encoding="utf-8")
    log_pipeline(
        lecture_path,
        f"PDF processing complete — {len(pdf_files)} PDFs, {len(manifest)} page images",
    )


def reset_pdf_processing(lecture_path: Path) -> None:
    """Clear PDF outputs so the next pipeline run re-extracts slide images."""
    images_dir = lecture_path / "extracted_images"
    marker_path = lecture_path / "transcripts" / ".pdf_processed"

    if images_dir.exists():
        shutil.rmtree(images_dir)
    marker_path.unlink(missing_ok=True)
    log_pipeline(lecture_path, "PDF processing reset — slide images will be re-extracted")
