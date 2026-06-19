from pathlib import Path

import fitz

from backend.services.job_status import log_pipeline, write_job_status


def process_pdf(lecture_path: Path) -> None:
    pdf_path = lecture_path / "raw_media" / "presentation.pdf"
    pdf_text_path = lecture_path / "transcripts" / "pdf_text.txt"
    images_dir = lecture_path / "extracted_images"
    marker_path = lecture_path / "transcripts" / ".pdf_processed"

    if not pdf_path.exists():
        raise FileNotFoundError("presentation.pdf not found in raw_media/")

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

    doc = fitz.open(pdf_path)
    text_parts: list[str] = []
    image_counter = 0

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
                    lecture_path,
                    f"Saved image {image_name} (page {page_num}, index {img_index})",
                )
    finally:
        doc.close()

    pdf_text_path.write_text("\n\n".join(text_parts), encoding="utf-8")
    marker_path.write_text("done", encoding="utf-8")
    log_pipeline(
        lecture_path,
        f"PDF processing complete — {image_counter} images, text saved",
    )
