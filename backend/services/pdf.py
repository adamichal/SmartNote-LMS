from pathlib import Path

import fitz

from backend.services.job_status import log_pipeline, write_job_status


def _collect_pdf_files(raw_media_dir: Path) -> list[Path]:
    pdfs: list[Path] = []
    presentation = raw_media_dir / "presentation.pdf"
    if presentation.exists():
        pdfs.append(presentation)
    pdfs.extend(sorted(raw_media_dir.glob("extra_material_*.pdf")))
    return pdfs


def _extract_pdf(pdf_path: Path, images_dir: Path, image_counter: int) -> tuple[str, int]:
    doc = fitz.open(pdf_path)
    text_parts: list[str] = []

    try:
        for page_num, page in enumerate(doc):
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(page_text)

            for img_index, img in enumerate(page.get_images()):
                xref = img[0]
                pix = fitz.Pixmap(doc, xref)
                if pix.n - pix.alpha >= 4:
                    pix = fitz.Pixmap(fitz.csRGB, pix)

                image_counter += 1
                image_name = f"slide_{image_counter:03d}.png"
                pix.save(str(images_dir / image_name))
                log_pipeline(
                    images_dir.parent,
                    f"Saved {image_name} from {pdf_path.name} (page {page_num}, index {img_index})",
                )
    finally:
        doc.close()

    label = "Presentation" if pdf_path.name == "presentation.pdf" else pdf_path.stem.replace("_", " ")
    section_text = "\n\n".join(text_parts)
    if not section_text.strip():
        return "", image_counter
    return f"### {label}\n{section_text}", image_counter


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
    image_counter = 0

    for pdf_path in pdf_files:
        section_text, image_counter = _extract_pdf(pdf_path, images_dir, image_counter)
        if section_text:
            combined_sections.append(section_text)

    pdf_text_path.write_text("\n\n".join(combined_sections), encoding="utf-8")
    marker_path.write_text("done", encoding="utf-8")
    log_pipeline(
        lecture_path,
        f"PDF processing complete — {len(pdf_files)} PDFs, {image_counter} images",
    )
