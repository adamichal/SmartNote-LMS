import re
from pathlib import Path
from urllib.parse import quote

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

PRINT_CSS = """
@page {
  size: A4;
  margin: 18mm 16mm;
}
* { box-sizing: border-box; }
body {
  font-family: "Heebo", "Segoe UI", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.8;
  direction: rtl;
  color: #1f2937;
  max-width: 210mm;
  margin: 0 auto;
  padding: 24px;
  background: #fff;
}
h1 { font-size: 24px; margin: 1.2em 0 0.6em; font-weight: 700; color: #0f172a; border-bottom: 3px solid #4f46e5; padding-bottom: 0.5em; }
h2 { font-size: 20px; margin: 1.2em 0 0.5em; font-weight: 600; border-right: 4px solid #a5b4fc; padding-right: 0.6em; }
h3 { font-size: 16px; margin: 0.8em 0 0.4em; font-weight: 600; }
p { margin: 0.65em 0; }
ul, ol { margin: 0.65em 0; padding-right: 1.5em; }
strong { font-weight: 700; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
blockquote {
  margin: 1em 0;
  padding: 0.75em 1em;
  border-right: 4px solid #6366f1;
  background: #eef2ff;
  border-radius: 0.4em 0 0 0.4em;
  color: #312e81;
}
code, pre {
  direction: ltr;
  unicode-bidi: embed;
  font-family: Consolas, "Courier New", monospace;
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
  page-break-inside: avoid;
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
.notebook-callout {
  margin: 1.2em 0;
  padding: 0.9em 1em 1em;
  border-radius: 0.6em;
  border: 1px solid transparent;
  page-break-inside: avoid;
}
.notebook-callout--summary { background: #f0fdf4; border-color: #bbf7d0; }
.notebook-callout--exam { background: #fffbeb; border-color: #fde68a; }
.notebook-callout--diff { background: #f8fafc; border-color: #cbd5e1; }
.notebook-callout h2 { border-right: none; padding-right: 0; margin-top: 0; }
.katex { direction: ltr; unicode-bidi: embed; font-size: 1.05em; }
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: -24px -24px 24px;
  padding: 16px 24px;
  background: #eef2ff;
  border-bottom: 1px solid #c7d2fe;
}
.print-toolbar button {
  border: none;
  border-radius: 8px;
  background: #4f46e5;
  color: #fff;
  padding: 10px 18px;
  font-size: 14px;
  cursor: pointer;
}
.print-toolbar button:hover { background: #4338ca; }
.print-hint { font-size: 13px; color: #4338ca; }
@media print {
  body { padding: 0; max-width: none; }
  .no-print { display: none !important; }
}
"""

KATEX_CDN = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist"
PRINT_SCRIPTS = f"""
<script defer src="{KATEX_CDN}/katex.min.js"></script>
<script defer src="{KATEX_CDN}/contrib/auto-render.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function () {{
  function renderMath() {{
    if (typeof renderMathInElement !== "function") return;
    renderMathInElement(document.body, {{
      delimiters: [
        {{ left: "$$", right: "$$", display: true }},
        {{ left: "$", right: "$", display: false }},
      ],
      throwOnError: false,
    }});
  }}
  renderMath();
  setTimeout(renderMath, 300);

  document.querySelectorAll("h2").forEach(function (heading) {{
    var text = heading.textContent || "";
    var className = null;
    if (text.indexOf("סיכום מהיר") >= 0) className = "notebook-callout notebook-callout--summary";
    else if (text.indexOf("נקודות למבחן") >= 0) className = "notebook-callout notebook-callout--exam";
    else if (text.indexOf("נושאים מהמצגת") >= 0 || text.indexOf("לא נדונו") >= 0) {{
      className = "notebook-callout notebook-callout--diff";
    }}
    if (!className) return;

    var wrapper = document.createElement("div");
    wrapper.className = className;
    heading.parentNode.insertBefore(wrapper, heading);
    wrapper.appendChild(heading);
    var sibling = wrapper.nextSibling;
    while (sibling && !(sibling.nodeType === 1 && /^(H1|H2)$/.test(sibling.tagName))) {{
      var next = sibling.nextSibling;
      wrapper.appendChild(sibling);
      sibling = next;
    }}
  }});

  var params = new URLSearchParams(window.location.search);
  if (params.get("autoprint") === "1") {{
    setTimeout(function () {{ window.print(); }}, 900);
  }}
}});
</script>
"""


def _ensure_exports_dir(lecture_path: Path) -> Path:
    exports_dir = lecture_path / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    return exports_dir


def _clean_export_markdown(content: str, images_dir: Path) -> str:
    content = LEGACY_SLIDE_REF_PATTERN.sub("", content)

    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2)
        if not (images_dir / filename).is_file():
            return ""
        return match.group(0)

    return IMAGE_PATH_PATTERN.sub(replace_image, content)


def _rewrite_image_paths_for_browser(
    content: str,
    lecture_id: str,
    images_dir: Path,
) -> str:
    encoded_lecture = quote(lecture_id, safe="")

    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2)
        if not (images_dir / filename).is_file():
            return ""
        encoded_file = quote(filename, safe="")
        return f"![{alt}](/api/lectures/{encoded_lecture}/images/{encoded_file})"

    return IMAGE_PATH_PATTERN.sub(replace_image, content)


def build_print_html(lecture_path: Path, lecture_id: str, *, autoprint: bool = False) -> str:
    content = read_notebook(lecture_path)
    images_dir = lecture_path / "extracted_images"
    export_content = _clean_export_markdown(content, images_dir)
    export_content = _rewrite_image_paths_for_browser(export_content, lecture_id, images_dir)

    body = markdown.markdown(
        export_content,
        extensions=["extra", "nl2br", "sane_lists", "tables"],
    )

    title = lecture_path.name.replace("_", " ")

    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>{title} — SmartNote</title>
  <link rel="stylesheet" href="{KATEX_CDN}/katex.min.css">
  <style>{PRINT_CSS}</style>
</head>
<body>
  <div class="print-toolbar no-print">
    <p class="print-hint">להמרת המחברת ל-PDF: לחץ על הכפתור ובחר <strong>שמור כ-PDF</strong> / <strong>Microsoft Print to PDF</strong></p>
    <button type="button" onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button>
  </div>
  <article class="notebook-content">{body}</article>
  {PRINT_SCRIPTS}
</body>
</html>"""


def check_pdf_export_available() -> dict:
    return {
        "available": True,
        "engine": "browser_print",
        "message": "PDF export uses browser print (Save as PDF)",
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
    raise RuntimeError(
        "PDF export is handled via browser print. "
        "Open GET /api/lectures/{lecture_id}/export/print?autoprint=1 from the notebook editor."
    )


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
