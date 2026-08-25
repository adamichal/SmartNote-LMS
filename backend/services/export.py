import base64
import re
import zipfile
from pathlib import Path
from urllib.parse import quote

import fitz
import markdown
import pypandoc

from backend.services import filesystem as fs
from backend.services.notebook_format import format_notebook_content
from backend.services.notebook import normalize_image_filename, read_notebook

IMAGE_PATH_PATTERN = re.compile(
    r"!\[([^\]]*)\]\((?:\./)?(?:extracted_images/)?((?:page|slide)_\d+\.png)\)",
    re.IGNORECASE,
)

PRINT_CSS = """
@page {
  size: A4;
  margin: 22mm 18mm 20mm;
  @top-right {
    content: counter(page);
    font-family: "Playpen Sans Hebrew", "Assistant", Arial, sans-serif;
    font-size: 11px;
    color: #94a3b8;
  }
}
@page :first {
  margin-top: 18mm;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body, p, li, td, th, blockquote, figcaption, h1, h2, h3, h4, h5, h6, ul, ol, div, span {
  font-family: "Playpen Sans Hebrew", "Assistant", "Segoe UI", Arial, sans-serif !important;
}
body {
  font-size: 16px;
  line-height: 1.85;
  direction: rtl;
  color: #1a2332;
  max-width: 210mm;
  margin: 0 auto;
  padding: 24px;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
h1, h2, h3, h4 { orphans: 3; widows: 3; }
h1 {
  font-size: 26px;
  margin: 0 0 0.35em;
  font-weight: 800;
  color: #1e3a5f;
  line-height: 1.25;
  page-break-after: avoid;
}
h2 {
  font-size: 20px;
  margin: 1.6em 0 0.55em;
  font-weight: 700;
  padding: 0.4em 0.7em;
  border-right: 3px solid #3b6ea5;
  background: #eff6ff;
  border-radius: 0.35em;
  color: #1e3a5f;
  page-break-after: avoid;
}
h3 {
  font-size: 17px;
  margin: 1.2em 0 0.4em;
  font-weight: 600;
  color: #2a4a6f;
  page-break-after: avoid;
}
h4 {
  font-size: 15px;
  margin: 1em 0 0.3em;
  font-weight: 600;
  color: #365a85;
  page-break-after: avoid;
}
p { margin: 0 0 0.8em; orphans: 2; widows: 2; }
ul, ol { margin: 0.2em 0 0.9em; padding-right: 1.6em; direction: rtl; }
li { margin: 0.3em 0; }
li::marker { color: #3b6ea5; font-weight: 600; }
strong { font-weight: 700; color: #000; }
em { color: #334155; }
hr {
  border: none;
  height: 1px;
  margin: 1.8em 0;
  background: linear-gradient(270deg, transparent, #cbd5e1 20%, #cbd5e1 80%, transparent);
  page-break-after: avoid;
}
blockquote {
  margin: 1em 0;
  padding: 0.8em 1em;
  border-right: 3px solid #c4b5d8;
  background: #f3eef8;
  border-radius: 0.35em;
  color: #5b4b7a;
  page-break-inside: avoid;
}
blockquote.notebook-definition {
  border-right-color: #c4b5d8;
  background: #f3eef8;
  color: #5b4b7a;
}
code, pre {
  direction: ltr;
  unicode-bidi: embed;
  font-family: Consolas, "Courier New", monospace !important;
}
code {
  background: #f1f5f9;
  padding: 0.1em 0.35em;
  border-radius: 0.25em;
  font-size: 0.88em;
  border: 1px solid #e2e8f0;
}
pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 0.9em 1em;
  border-radius: 0.5em;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 0.88em;
  page-break-inside: avoid;
}
pre code { background: transparent; color: inherit; padding: 0; border: none; }
img {
  display: block;
  width: auto;
  max-width: min(88%, 34rem);
  max-height: 20rem;
  height: auto;
  margin: 1em auto;
  object-fit: contain;
  page-break-inside: avoid;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
}
figure.notebook-figure {
  margin: 1.2em auto;
  max-width: min(88%, 34rem);
  text-align: center;
  page-break-inside: avoid;
}
figure.notebook-figure img { margin: 0 auto; }
figcaption {
  margin-top: 0.4em;
  font-size: 0.82em;
  color: #64748b;
  font-style: italic;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.93em;
  page-break-inside: avoid;
}
th, td { border: 1px solid #cbd5e1; padding: 0.45em 0.65em; }
th { background: #f0f9ff; font-weight: 700; color: #0f172a; }
tbody tr:nth-child(even) td { background: #f8fafc; }
.notebook-callout {
  margin: 1.2em 0;
  padding: 0.85em 1em 1em;
  border-radius: 0.55em;
  border: 1px solid transparent;
  page-break-inside: avoid;
}
.notebook-callout--summary { background: #eff6ff; border-color: #bfdbfe; }
.notebook-callout--context { background: #eff6ff; border-color: #bfdbfe; }
.notebook-callout--exam { background: #fff0f5; border-color: #f5d0e0; }
.notebook-callout--diff { background: #fff0f5; border-color: #f5d0e0; }
.notebook-callout > h2::before { display: none; }
.notebook-callout h2 { border-right: none; padding: 0; margin-top: 0; background: none; }
.notebook-diagram {
  margin: 1.4em auto;
  max-width: 100%;
  padding: 0.9em 1.1em;
  border: 1px solid #e2e8f0;
  border-radius: 0.6em;
  background: #f8fafc;
  overflow-x: auto;
  page-break-inside: avoid;
}
.notebook-diagram svg {
  display: block;
  margin: 0 auto;
  width: auto;
  max-width: 100%;
  height: auto;
}
.notebook-diagram svg foreignObject { overflow: visible; }
.notebook-diagram svg .nodeLabel,
.notebook-diagram svg foreignObject div,
.notebook-diagram svg foreignObject span {
  overflow: visible !important;
  direction: rtl;
  text-align: center;
}
.notebook-arrow {
  direction: ltr;
  unicode-bidi: isolate;
  display: inline-block;
  padding: 0 0.12em;
  color: #9a7b5f;
  font-weight: 600;
}
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
  padding: 14px 24px;
  background: #f7f3ed;
  border-bottom: 1px solid #e8ddd0;
}
.print-toolbar button {
  border: none;
  border-radius: 8px;
  background: #9a7b5f;
  color: #fff;
  padding: 9px 18px;
  font-size: 14px;
  cursor: pointer;
}
.print-toolbar button:hover { background: #7d6349; }
.print-hint { font-size: 13px; color: #7d6349; }
@media print {
  body { padding: 0; max-width: none; }
  .no-print { display: none !important; }
  h2, h3, h4 { page-break-after: avoid; }
  p, li { page-break-inside: avoid; }
  .notebook-callout, .notebook-diagram, figure, table, pre, blockquote {
    page-break-inside: avoid;
  }
  section, article { page-break-inside: auto; }
}
"""

KATEX_CDN = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist"
MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist"
GOOGLE_FONTS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Playpen+Sans+Hebrew:wght@300;400;500;600;700;800&"
    "family=Assistant:wght@400;500;600;700;800&"
    "display=block"
)
PLAYPEN_FONT_STACK = '"Playpen Sans Hebrew", "Assistant", "Segoe UI", Arial, sans-serif'
PRINT_SCRIPTS = f"""
<script defer src="{KATEX_CDN}/katex.min.js"></script>
<script defer src="{KATEX_CDN}/contrib/auto-render.min.js"></script>
<script defer src="{MERMAID_CDN}/mermaid.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", async function () {{
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

  function fixMermaidLabelClipping(svgRoot) {{
    if (!svgRoot) return;
    var padX = 28;
    var padY = 12;
    svgRoot.querySelectorAll("g.node, g.actor, g.task").forEach(function (nodeGroup) {{
      var fo = nodeGroup.querySelector("foreignObject");
      if (!fo) return;
      var content = fo.querySelector(".nodeLabel") || fo.querySelector("div") || fo.querySelector("span");
      if (!content) return;
      content.style.direction = "rtl";
      content.style.unicodeBidi = "plaintext";
      content.style.textAlign = "center";
      content.style.overflow = "visible";
      content.style.whiteSpace = "nowrap";
      content.style.display = "inline-block";
      content.style.width = "max-content";
      content.style.maxWidth = "none";
      var neededW = Math.ceil(content.scrollWidth || 0) + padX;
      var neededH = Math.ceil(content.scrollHeight || 0) + padY;
      var foW = parseFloat(fo.getAttribute("width") || "0");
      var foH = parseFloat(fo.getAttribute("height") || "0");
      var dW = Math.max(0, neededW - foW);
      var dH = Math.max(0, neededH - foH);
      if (!dW && !dH) return;
      fo.setAttribute("width", String(foW + dW));
      fo.setAttribute("x", String(parseFloat(fo.getAttribute("x") || "0") - dW / 2));
      if (dH > 0) {{
        fo.setAttribute("height", String(foH + dH));
        fo.setAttribute("y", String(parseFloat(fo.getAttribute("y") || "0") - dH / 2));
      }}
      nodeGroup.querySelectorAll("rect").forEach(function (rect) {{
        var rw = parseFloat(rect.getAttribute("width") || "0");
        var rh = parseFloat(rect.getAttribute("height") || "0");
        if (rw > 0) {{
          rect.setAttribute("width", String(rw + dW));
          rect.setAttribute("x", String(parseFloat(rect.getAttribute("x") || "0") - dW / 2));
        }}
        if (rh > 0 && dH > 0) {{
          rect.setAttribute("height", String(rh + dH));
          rect.setAttribute("y", String(parseFloat(rect.getAttribute("y") || "0") - dH / 2));
        }}
      }});
      content.style.whiteSpace = "normal";
      content.style.width = "100%";
      content.style.maxWidth = "100%";
    }});
    svgRoot.querySelectorAll("foreignObject").forEach(function (fo) {{
      fo.setAttribute("overflow", "visible");
    }});
    try {{
      var bbox = svgRoot.getBBox();
      if (bbox.width > 1 && bbox.height > 1) {{
        var current = svgRoot.getAttribute("viewBox");
        if (current) {{
          var parts = current.split(/\\s+/).map(parseFloat);
          if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {{
            var minX = Math.min(parts[0], bbox.x);
            var minY = Math.min(parts[1], bbox.y);
            var maxX = Math.max(parts[0] + parts[2], bbox.x + bbox.width);
            var maxY = Math.max(parts[1] + parts[3], bbox.y + bbox.height);
            var pad = 16;
            svgRoot.setAttribute("viewBox", (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2));
          }}
        }}
      }}
    }} catch (e) {{}}
  }}

  async function renderMermaid() {{
    if (typeof mermaid === "undefined") return;
    mermaid.initialize({{
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      fontFamily: "Assistant, Segoe UI, Arial, sans-serif",
      flowchart: {{
        htmlLabels: true,
        padding: 28,
        nodeSpacing: 55,
        rankSpacing: 55,
        wrappingWidth: 420,
        useMaxWidth: false,
      }},
      mindmap: {{
        padding: 20,
        useMaxWidth: true,
      }},
      themeVariables: {{
        fontFamily: "Assistant, Segoe UI, Arial, sans-serif",
        fontSize: "20px",
        primaryColor: "#f0f9ff",
        primaryTextColor: "#1e293b",
        primaryBorderColor: "#7dd3fc",
        lineColor: "#64748b",
      }},
    }});

    var blocks = document.querySelectorAll("pre.mermaid, pre > code.language-mermaid");
    var nodes = [];
    blocks.forEach(function (block) {{
      var source = (block.textContent || "").trim();
      if (source.startsWith("```mermaid")) {{
        source = source.replace(/^```mermaid\\s*\\n?/i, "").replace(/\\n?```\\s*$/i, "").trim();
      }}
      var pre = block.nodeName === "PRE" ? block : block.parentElement;
      if (!pre) return;
      pre.className = "mermaid";
      pre.textContent = source;
      pre.removeAttribute("data-processed");
      nodes.push(pre);
    }});

    if (!nodes.length) return;
    try {{
      await mermaid.run({{ nodes: nodes, suppressErrors: false }});
      nodes.forEach(function (pre) {{
        if (!pre.querySelector("svg")) return;
        var wrapper = document.createElement("div");
        wrapper.className = "notebook-diagram";
        wrapper.innerHTML = pre.innerHTML;
        pre.replaceWith(wrapper);
        var svg = wrapper.querySelector("svg");
        if (svg) {{
          fixMermaidLabelClipping(svg);
          svg.style.maxWidth = "100%";
          svg.style.width = "auto";
          svg.style.height = "auto";
        }}
      }});
    }} catch (err) {{}}
  }}

  await renderMermaid();
  renderMath();
  setTimeout(renderMath, 300);

  document.querySelectorAll("h2").forEach(function (heading) {{
    var text = heading.textContent || "";
    var className = null;
    if (text.indexOf("סיכום מהיר") >= 0) className = "notebook-callout notebook-callout--summary";
    else if (text.indexOf("מיקום בקורס") >= 0) className = "notebook-callout notebook-callout--context";
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

  document.querySelectorAll("blockquote").forEach(function (quote) {{
    if (/הגדרה\\s*[—\\-–:]/u.test(quote.textContent || "")) {{
      quote.classList.add("notebook-definition");
    }}
  }});

  window.__exportReady = true;
  var params = new URLSearchParams(window.location.search);
  if (params.get("autoprint") === "1") {{
    setTimeout(function () {{ window.print(); }}, 1400);
  }}
}});
</script>
"""


def _ensure_exports_dir(lecture_path: Path) -> Path:
    exports_dir = lecture_path / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    return exports_dir


def _clean_export_markdown(content: str, images_dir: Path) -> str:
    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2).strip()
        normalized = normalize_image_filename(filename, images_dir)
        if not normalized:
            return ""
        return f"![{alt}](./extracted_images/{normalized})"

    return IMAGE_PATH_PATTERN.sub(replace_image, content)


def _image_to_data_url(image_path: Path) -> str:
    suffix = image_path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _embed_local_images(content: str, images_dir: Path) -> str:
    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2).strip()
        normalized = normalize_image_filename(filename, images_dir)
        if not normalized:
            return ""
        image_path = images_dir / normalized
        if not image_path.is_file():
            return ""
        return f"![{alt}]({_image_to_data_url(image_path)})"

    return IMAGE_PATH_PATTERN.sub(replace_image, content)


def _rewrite_image_paths_for_browser(
    content: str,
    course_name: str,
    lecture_id: str,
    images_dir: Path,
) -> str:
    encoded_course = quote(course_name, safe="")
    encoded_lecture = quote(lecture_id, safe="")

    def replace_image(match: re.Match) -> str:
        alt = match.group(1)
        filename = match.group(2).strip()
        normalized = normalize_image_filename(filename, images_dir)
        if not normalized:
            return ""
        encoded_file = quote(normalized, safe="")
        return (
            f"![{alt}](/api/courses/{encoded_course}/lectures/"
            f"{encoded_lecture}/images/{encoded_file})"
        )

    return IMAGE_PATH_PATTERN.sub(replace_image, content)


def build_print_html(
    lecture_path: Path,
    course_name: str,
    lecture_id: str,
    *,
    autoprint: bool = False,
    for_pdf: bool = False,
) -> str:
    content = read_notebook(lecture_path)
    title = lecture_path.name.replace("_", " ")
    return build_print_html_from_markdown(
        content,
        title=title,
        lecture_path=lecture_path,
        course_name=course_name,
        lecture_id=lecture_id,
        for_pdf=for_pdf,
        autoprint=autoprint,
    )


def build_print_html_from_markdown(
    markdown_content: str,
    *,
    title: str,
    lecture_path: Path | None = None,
    course_name: str = "",
    lecture_id: str = "",
    for_pdf: bool = False,
    autoprint: bool = False,
    show_toolbar: bool = True,
) -> str:
    export_content = format_notebook_content(markdown_content)
    images_dir = (lecture_path / "extracted_images") if lecture_path else None
    if images_dir and images_dir.is_dir():
        export_content = _clean_export_markdown(export_content, images_dir)
        if for_pdf:
            export_content = _embed_local_images(export_content, images_dir)
        elif course_name and lecture_id:
            export_content = _rewrite_image_paths_for_browser(
                export_content,
                course_name,
                lecture_id,
                images_dir,
            )

    body = markdown.markdown(
        export_content,
        extensions=["extra", "nl2br", "sane_lists", "tables"],
    )

    toolbar = ""
    if show_toolbar and not for_pdf:
        toolbar = """
  <div class="print-toolbar no-print">
    <p class="print-hint">להמרת המחברת ל-PDF: לחץ על הכפתור ובחר <strong>שמור כ-PDF</strong> / <strong>Microsoft Print to PDF</strong></p>
    <button type="button" onclick="window.print()">🖨️ הדפס / שמור כ-PDF</button>
  </div>"""

    return f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>{title} — SmartNote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="{GOOGLE_FONTS_URL}" rel="stylesheet" />
  <link rel="stylesheet" href="{KATEX_CDN}/katex.min.css" />
  <style>{PRINT_CSS}</style>
</head>
<body style="font-family: {PLAYPEN_FONT_STACK};">{toolbar}
  <article class="notebook-content">{body}</article>
  {PRINT_SCRIPTS}
</body>
</html>"""


def _wait_for_print_fonts(page) -> None:
    page.wait_for_function("window.__exportReady === true", timeout=180_000)
    page.evaluate(
        """async () => {
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
          }
          const families = ["Playpen Sans Hebrew", "Assistant"];
          for (const family of families) {
            for (const weight of [400, 600, 700, 800]) {
              try {
                await document.fonts.load(`${weight} 16px "${family}"`);
              } catch (e) {}
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 600));
        }"""
    )


def render_html_to_pdf(html: str) -> bytes:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "PDF export requires Playwright. Install with: "
            "pip install playwright && playwright install chromium"
        ) from exc

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle", timeout=120_000)
            _wait_for_print_fonts(page)
            return page.pdf(
                format="A4",
                print_background=True,
                margin={
                    "top": "22mm",
                    "right": "18mm",
                    "bottom": "20mm",
                    "left": "18mm",
                },
            )
        finally:
            browser.close()


def merge_pdf_bytes(parts: list[bytes]) -> bytes:
    if not parts:
        raise ValueError("No PDF parts to merge")
    if len(parts) == 1:
        return parts[0]

    merged = fitz.open()
    try:
        for part in parts:
            doc = fitz.open(stream=part, filetype="pdf")
            merged.insert_pdf(doc)
            doc.close()
        return merged.tobytes()
    finally:
        merged.close()


def _ready_lectures(course_name: str) -> list[dict]:
    course_path = fs.get_course_path_or_404(course_name)
    lectures = fs.list_lectures(course_name)
    return [
        lecture
        for lecture in lectures
        if (course_path / lecture["id"] / "final_notebook.md").is_file()
    ]


def _ready_exam_summaries(course_name: str) -> list[dict]:
    course_path = fs.get_course_path_or_404(course_name)
    lectures = fs.list_lectures(course_name)
    return [
        lecture
        for lecture in lectures
        if (course_path / lecture["id"] / "exam_summary.md").is_file()
    ]


def export_course_notebooks_combined_pdf(course_name: str) -> tuple[Path, str]:
    """Merge all lecture notebooks into a single PDF."""
    course_path = fs.get_course_path_or_404(course_name)
    ready = _ready_lectures(course_name)
    if not ready:
        raise FileNotFoundError("No completed notebooks found in this course")

    pdf_parts: list[bytes] = []
    failed: list[str] = []

    for lecture in ready:
        lecture_path = course_path / lecture["id"]
        try:
            html = build_print_html(
                lecture_path,
                course_name,
                lecture["id"],
                for_pdf=True,
            )
            pdf_parts.append(render_html_to_pdf(html))
        except Exception as exc:
            failed.append(f"{lecture['id']}: {exc}")

    if not pdf_parts:
        raise RuntimeError(
            "PDF export failed for all notebooks. "
            "Ensure Playwright is installed: pip install playwright && playwright install chromium"
        )

    combined = merge_pdf_bytes(pdf_parts)
    exports_dir = course_path / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    output_path = exports_dir / "course_notebooks.pdf"
    output_path.write_bytes(combined)

    if failed:
        (exports_dir / "_export_errors.txt").write_text(
            "Failed lectures:\n" + "\n".join(failed) + "\n",
            encoding="utf-8",
        )

    return output_path, f"{course_name}_notebooks.pdf"


def export_course_exam_summaries_combined_pdf(course_name: str) -> tuple[Path, str]:
    """Merge all exam summaries into a single PDF."""
    from backend.services.exam_summary import read_exam_summary

    course_path = fs.get_course_path_or_404(course_name)
    ready = _ready_exam_summaries(course_name)
    if not ready:
        raise FileNotFoundError("No exam summaries found in this course")

    pdf_parts: list[bytes] = []
    failed: list[str] = []

    for lecture in ready:
        lecture_path = course_path / lecture["id"]
        try:
            summary_md = read_exam_summary(lecture_path)
            title = f"סיכום למבחן — הרצאה {lecture['number']}: {lecture['topic']}"
            html = build_print_html_from_markdown(
                summary_md,
                title=title,
                lecture_path=lecture_path,
                course_name=course_name,
                lecture_id=lecture["id"],
                for_pdf=True,
                show_toolbar=False,
            )
            pdf_parts.append(render_html_to_pdf(html))
        except Exception as exc:
            failed.append(f"{lecture['id']}: {exc}")

    if not pdf_parts:
        raise RuntimeError(
            "PDF export failed for all exam summaries. "
            "Generate summaries first (עבד AI מחדש / צור סיכום למבחן)."
        )

    combined = merge_pdf_bytes(pdf_parts)
    exports_dir = course_path / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    output_path = exports_dir / "course_exam_summaries.pdf"
    output_path.write_bytes(combined)

    if failed:
        (exports_dir / "_exam_summary_export_errors.txt").write_text(
            "Failed lectures:\n" + "\n".join(failed) + "\n",
            encoding="utf-8",
        )

    return output_path, f"{course_name}_exam_summaries.pdf"


def export_lecture_pdf(
    lecture_path: Path,
    course_name: str,
    lecture_id: str,
) -> tuple[Path, str, str]:
    html = build_print_html(
        lecture_path,
        course_name,
        lecture_id,
        for_pdf=True,
    )
    pdf_bytes = render_html_to_pdf(html)
    exports_dir = _ensure_exports_dir(lecture_path)
    output_path = exports_dir / "notebook.pdf"
    output_path.write_bytes(pdf_bytes)
    return output_path, "application/pdf", f"{lecture_path.name}_notebook.pdf"


def export_course_notebooks_zip(course_name: str) -> tuple[Path, str]:
    course_path = fs.get_course_path_or_404(course_name)
    ready = _ready_lectures(course_name)
    if not ready:
        raise FileNotFoundError("No completed notebooks found in this course")

    exports_dir = course_path / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    zip_path = exports_dir / "course_notebooks.zip"

    exported: list[str] = []
    failed: list[str] = []

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for lecture in ready:
            lecture_path = course_path / lecture["id"]
            pdf_name = f"{lecture['id']}.pdf"
            try:
                html = build_print_html(
                    lecture_path,
                    course_name,
                    lecture["id"],
                    for_pdf=True,
                )
                archive.writestr(pdf_name, render_html_to_pdf(html))
                exported.append(pdf_name)
            except Exception as exc:
                failed.append(f"{pdf_name}: {exc}")

        summary_lines = [
            f"Course: {course_name}",
            f"Exported: {len(exported)} notebook(s)",
        ]
        if exported:
            summary_lines.append("")
            summary_lines.append("Files:")
            summary_lines.extend(f"  - {name}" for name in exported)
        if failed:
            summary_lines.append("")
            summary_lines.append("Failed:")
            summary_lines.extend(f"  - {line}" for line in failed)
        archive.writestr("_export_summary.txt", "\n".join(summary_lines) + "\n")

    if not exported:
        zip_path.unlink(missing_ok=True)
        raise RuntimeError(
            "PDF export failed for all notebooks. "
            "Ensure Playwright is installed: pip install playwright && playwright install chromium"
        )

    return zip_path, f"{course_name}_notebooks.zip"


def check_pdf_export_available() -> dict:
    try:
        import playwright  # noqa: F401

        return {
            "available": True,
            "engine": "playwright",
            "message": "PDF export via Playwright (Chromium)",
        }
    except ImportError:
        return {
            "available": False,
            "engine": "playwright",
            "message": "Install Playwright: pip install playwright && playwright install chromium",
        }


def export_markdown(lecture_path: Path) -> tuple[Path, str, str]:
    notebook_path = lecture_path / "final_notebook.md"
    if not notebook_path.exists():
        raise FileNotFoundError("final_notebook.md not found")
    exports_dir = _ensure_exports_dir(lecture_path)
    output_path = exports_dir / "notebook.md"
    output_path.write_text(read_notebook(lecture_path), encoding="utf-8")
    return output_path, "text/markdown; charset=utf-8", f"{lecture_path.name}_notebook.md"


def export_pdf(
    lecture_path: Path,
    *,
    course_name: str,
    lecture_id: str,
) -> tuple[Path, str, str]:
    return export_lecture_pdf(lecture_path, course_name, lecture_id)


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


def export_notebook(
    lecture_path: Path,
    export_format: str,
    *,
    course_name: str,
    lecture_id: str,
) -> tuple[Path, str, str]:
    if export_format == "md":
        return export_markdown(lecture_path)
    if export_format == "pdf":
        return export_pdf(
            lecture_path,
            course_name=course_name,
            lecture_id=lecture_id,
        )
    if export_format == "docx":
        return export_docx(lecture_path)
    raise ValueError(f"Unsupported export format: {export_format}")
