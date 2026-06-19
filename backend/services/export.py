import re
from io import BytesIO
from pathlib import Path

import markdown
import pypandoc

from backend.services.notebook import read_notebook

IMAGE_PATH_PATTERN = re.compile(
    r"!\[([^\]]*)\]\(\./extracted_images/([^)]+)\)"
)
LEGACY_SLIDE_REF_PATTERN = re.compile(
    r"!\[[^\]]*\]\(\./extracted_images/slide_[^)]+\)\s*",
    re.IGNORECASE,
)

PDF_CSS = """
@page {
  size: A4;
  margin: 2cm;
}
body {
  font-family: NotebookFont, "Segoe UI", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.7;
  direction: rtl;
  color: #1f2937;
}
h1 { font-size: 22px; margin: 1.2em 0 0.6em; }
h2 { font-size: 18px; margin: 1em 0 0.5em; }
h3 { font-size: 15px; margin: 0.8em 0 0.4em; }
p { margin: 0.6em 0; }
ul, ol { margin: 0.6em 0; padding-right: 1.5em; }
strong { font-weight: 700; }
code, pre {
  direction: ltr;
  unicode-bidi: embed;
  font-family: Consolas, monospace;
  background: #f3f4f6;
}
pre {
  padding: 0.75em;
  border-radius: 6px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
img {
  display: block;
  max-width: 100%;
  margin: 1em auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
th, td {
  border: 1px solid #d1d5db;
  padding: 0.4em 0.6em;
}
"""


def _ensure_exports_dir(lecture_path: Path) -> Path:
    exports_dir = lecture_path / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    return exports_dir


def _register_export_font() -> None:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font_candidates = [
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for font_path in font_candidates:
        if font_path.is_file():
            pdfmetrics.registerFont(TTFont("NotebookFont", str(font_path)))
            return


def _pdf_link_callback(uri: str, _rel) -> str:
    if uri.startswith("file:"):
        return uri.replace("file:///", "").replace("file://", "")
    return uri


def _rewrite_image_paths_for_export(content: str, lecture_path: Path) -> str:
    images_dir = (lecture_path / "extracted_images").resolve()

    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2)
        image_path = (images_dir / filename).resolve()
        if not image_path.is_file():
            return ""
        return f"![{alt}]({image_path.as_uri()})"

    cleaned = LEGACY_SLIDE_REF_PATTERN.sub("", content)
    return IMAGE_PATH_PATTERN.sub(replace_image, cleaned)


def _markdown_to_html(content: str, lecture_path: Path) -> str:
    export_content = _rewrite_image_paths_for_export(content, lecture_path)
    body = markdown.markdown(
        export_content,
        extensions=["extra", "nl2br", "sane_lists", "tables"],
    )
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <style>{PDF_CSS}</style>
</head>
<body>{body}</body>
</html>"""


def check_pdf_export_available() -> dict:
    try:
        from xhtml2pdf import pisa  # noqa: F401

        return {"available": True, "engine": "xhtml2pdf", "message": "PDF export ready"}
    except ImportError:
        return {
            "available": False,
            "engine": None,
            "message": "xhtml2pdf is not installed. Run: pip install xhtml2pdf",
        }


def export_markdown(lecture_path: Path) -> tuple[Path, str, str]:
    notebook_path = lecture_path / "final_notebook.md"
    if not notebook_path.exists():
        raise FileNotFoundError("final_notebook.md not found")
    exports_dir = _ensure_exports_dir(lecture_path)
    output_path = exports_dir / "notebook.md"
    output_path.write_text(read_notebook(lecture_path), encoding="utf-8")
    return output_path, "text/markdown; charset=utf-8", f"{lecture_path.name}_notebook.md"


def export_pdf(lecture_path: Path) -> tuple[Path, str, str]:
    try:
        from xhtml2pdf import pisa
    except ImportError as exc:
        raise RuntimeError(
            "PDF export requires xhtml2pdf. Install dependencies: pip install -r requirements.txt"
        ) from exc

    _register_export_font()
    content = read_notebook(lecture_path)
    html = _markdown_to_html(content, lecture_path)
    exports_dir = _ensure_exports_dir(lecture_path)
    output_path = exports_dir / "notebook.pdf"

    result = BytesIO()
    status = pisa.CreatePDF(
        html,
        dest=result,
        encoding="utf-8",
        link_callback=_pdf_link_callback,
    )
    if status.err:
        raise RuntimeError("PDF export failed while rendering the notebook HTML")

    output_path.write_bytes(result.getvalue())
    return output_path, "application/pdf", f"{lecture_path.name}_notebook.pdf"


def export_docx(lecture_path: Path) -> tuple[Path, str, str]:
    notebook_path = lecture_path / "final_notebook.md"
    if not notebook_path.exists():
        raise FileNotFoundError("final_notebook.md not found")

    exports_dir = _ensure_exports_dir(lecture_path)
    output_path = exports_dir / "notebook.docx"

    try:
        pypandoc.convert_file(
            str(notebook_path),
            "docx",
            outputfile=str(output_path),
            extra_args=[f"--resource-path={lecture_path.resolve()}"],
        )
    except OSError as exc:
        raise RuntimeError(
            "Pandoc is not installed. Install Pandoc to enable DOCX export: "
            "https://pandoc.org/installing.html"
        ) from exc
    except RuntimeError as exc:
        raise RuntimeError(f"DOCX export failed: {exc}") from exc

    return (
        output_path,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        f"{lecture_path.name}_notebook.docx",
    )


def export_notebook(lecture_path: Path, export_format: str) -> tuple[Path, str, str]:
    if export_format == "md":
        return export_markdown(lecture_path)
    if export_format == "pdf":
        return export_pdf(lecture_path)
    if export_format == "docx":
        return export_docx(lecture_path)
    raise ValueError(f"Unsupported export format: {export_format}")
