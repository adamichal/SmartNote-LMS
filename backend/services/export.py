import re
from pathlib import Path

import markdown
import pypandoc

from backend.services.notebook import read_notebook

IMAGE_PATH_PATTERN = re.compile(
    r"!\[([^\]]*)\]\(\./extracted_images/([^)]+)\)"
)

PDF_CSS = """
@page {
  size: A4;
  margin: 2cm;
}
body {
  font-family: "Segoe UI", Arial, sans-serif;
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


def _rewrite_image_paths_for_export(content: str, lecture_path: Path) -> str:
    images_dir = (lecture_path / "extracted_images").resolve()

    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2)
        image_path = (images_dir / filename).resolve()
        if not image_path.is_file():
            return match.group(0)
        return f"![{alt}]({image_path.as_uri()})"

    return IMAGE_PATH_PATTERN.sub(replace_image, content)


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
        from weasyprint import HTML
    except ImportError as exc:
        raise RuntimeError(
            "WeasyPrint is not installed. Install requirements.txt to enable PDF export."
        ) from exc

    content = read_notebook(lecture_path)
    html = _markdown_to_html(content, lecture_path)
    exports_dir = _ensure_exports_dir(lecture_path)
    output_path = exports_dir / "notebook.pdf"
    HTML(string=html, base_url=str(lecture_path.resolve())).write_pdf(str(output_path))
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
