import katex from "katex";
import { resolveWordFont } from "./config";
import {
  calloutFill,
  definitionFill,
  escapeHtml,
  expandCalloutSections,
  fixRtlBrackets,
  scaleImageDimensions,
  WORD_THEME,
} from "./helpers";
import {
  needSpaceAfter,
  needSpaceBefore,
  prepareInlineSegments,
} from "./inlineSegments";
import { buildListTree } from "./listTree";

const LIST_MARKER_STYLES = ["disc", "circle", "square", "square"];

function listBaseStyle(fontCss, depth = 0, ordered = false) {
  const marker = ordered
    ? "decimal"
    : LIST_MARKER_STYLES[Math.min(depth, LIST_MARKER_STYLES.length - 1)];
  return `dir="rtl" style="text-align:right;direction:rtl;font-family:${fontCss};font-size:12pt;margin:0 0 12pt 0;padding:0 ${depth === 0 ? 24 : 20}px 0 0;list-style-type:${marker};list-style-position:outside;"`;
}

function renderNestedListNodes(nodes, fontCss, ordered, depth, renderItem) {
  if (!nodes.length) return "";
  const tag = ordered ? "ol" : "ul";
  let html = `<${tag} ${listBaseStyle(fontCss, depth, ordered)}>`;
  for (const node of nodes) {
    html += `<li style="margin-bottom:8pt;">`;
    html += renderItem(node.item);
    if (node.children.length) {
      html += renderNestedListNodes(node.children, fontCss, ordered, depth + 1, renderItem);
    }
    html += "</li>";
  }
  html += `</${tag}>`;
  return html;
}

function renderNestedList(block, fontCss, ordered) {
  const tree = buildListTree(block.items);
  const renderItem = (item) => renderInlineForWord(item.content);
  const startAttr = ordered && block.start > 1 ? ` start="${block.start}"` : "";
  if (!startAttr) {
    return renderNestedListNodes(tree, fontCss, ordered, 0, renderItem);
  }
  const tag = "ol";
  let html = `<${tag}${startAttr} ${listBaseStyle(fontCss, 0, true)}>`;
  for (const node of tree) {
    html += `<li style="margin-bottom:8pt;">`;
    html += renderItem(node.item);
    if (node.children.length) {
      html += renderNestedListNodes(node.children, fontCss, ordered, 1, renderItem);
    }
    html += "</li>";
  }
  html += `</${tag}>`;
  return html;
}


const HEADING_CLIPBOARD_STYLES = {
  h1: "font-size:16pt;font-weight:bold;margin:12px 0 6px 0;color:#1E3A5F;",
  h2: "font-size:14pt;font-weight:bold;color:#2A4A6F;margin:10px 0 4px 0;",
  h3: "font-size:13pt;font-weight:bold;margin:8px 0 4px 0;color:#365A85;",
  h4: "font-size:12pt;font-weight:bold;margin:6px 0 2px 0;color:#4A7FAD;",
};

const NON_BREAKING_SPACE = "\u00A0";

function wrapBold(html, bold) {
  return bold ? `<b>${html}</b>` : html;
}

/** NotebookLM-style inline renderer — simple RTL + fixRtlBrackets, no bidi splitting. */
function renderInlineForWord(text) {
  const segments = prepareInlineSegments(text);
  let html = "";

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.type === "math") {
      try {
        const mathml = katex.renderToString(segment.value, {
          throwOnError: false,
          displayMode: Boolean(segment.display),
          output: "mathml",
        });
        const spaceBefore = needSpaceBefore(segments, index) ? NON_BREAKING_SPACE : "";
        const spaceAfter = needSpaceAfter(segments, index) ? NON_BREAKING_SPACE : "";
        html += wrapBold(`${spaceBefore}${mathml}${spaceAfter}`, segment.bold);
      } catch {
        const raw = `<span dir="ltr" style="font-family:'Cambria Math',serif;">$${escapeHtml(segment.value)}$</span>`;
        const spaceBefore = needSpaceBefore(segments, index) ? NON_BREAKING_SPACE : "";
        const spaceAfter = needSpaceAfter(segments, index) ? NON_BREAKING_SPACE : "";
        html += wrapBold(`${spaceBefore}${raw}${spaceAfter}`, segment.bold);
      }
    } else if (segment.type === "code") {
      const codeHtml = `<code style="font-family:'Courier New',monospace;direction:ltr;unicode-bidi:embed;">${escapeHtml(segment.value)}</code>`;
      html += wrapBold(codeHtml, segment.bold);
    } else {
      const escaped = fixRtlBrackets(escapeHtml(segment.value));
      html += wrapBold(escaped, segment.bold);
    }
  }

  return html;
}

function blockBaseStyle(fontCss) {
  return `dir="rtl" style="text-align:right;direction:rtl;font-family:${fontCss};font-size:12pt;line-height:1.6;margin:0 0 12pt 0;"`;
}

function bodyParagraphStyle(fontCss, extra = "") {
  return `${blockBaseStyle(fontCss)}${extra}`;
}

function shadedParagraphStyle(fontCss, background, extra = "") {
  return `dir="rtl" style="text-align:right;direction:rtl;font-family:${fontCss};font-size:12pt;line-height:1.6;margin:0 0 12pt 0;padding:6pt 8pt;background:${background};color:#000;${extra}"`;
}

function renderShadedParagraphs(text, fontCss, background = WORD_THEME.neutral.html) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  return lines
    .map(
      (line) =>
        `<p ${shadedParagraphStyle(fontCss, background)}>${renderInlineForWord(line)}</p>`,
    )
    .join("");
}

function renderShadedSection(innerHtml, fontCss, background) {
  return `<div dir="rtl" style="text-align:right;direction:rtl;font-family:${fontCss};font-size:12pt;background:${background};color:#000;padding:6pt 10pt;margin:8pt 0;">${innerHtml}</div>`;
}

function renderImageBlock(block, includeImages, fontCss) {
  const base = blockBaseStyle(fontCss);
  if (includeImages && block.dataUrl) {
    const scaled = scaleImageDimensions(block.width, block.height);
    return `<p ${bodyParagraphStyle(fontCss)} style="text-align:center;"><img src="${block.dataUrl}" alt="${escapeHtml(block.alt || "")}" width="${scaled.width}" height="${scaled.height}" style="max-width:480px;display:block;margin:8px auto;" /></p>`;
  }
  const label = block.alt?.trim() || "שקף מההרצאה";
  return `<p ${base}><em style="color:#64748b;">[תמונה: ${escapeHtml(label)}]</em></p>`;
}

function renderSingleBlock(block, includeImages, fontCss, insideCallout = false) {
  const base = blockBaseStyle(fontCss);

  if (block.type === "h1" || block.type === "h2" || block.type === "h3" || block.type === "h4") {
    const extra = HEADING_CLIPBOARD_STYLES[block.type] || HEADING_CLIPBOARD_STYLES.h4;
    return `<${block.type} ${base} style="text-align:right;direction:rtl;font-family:${fontCss};${extra}">${renderInlineForWord(block.content)}</${block.type}>`;
  }
  if (block.type === "p") {
    return `<p ${base}>${renderInlineForWord(block.content)}</p>`;
  }
  if (block.type === "blockquote") {
    if (insideCallout) {
      const lines = block.content.split("\n").map((line) => line.trim()).filter(Boolean);
      return lines
        .map((line) => `<p ${base}>${renderInlineForWord(line)}</p>`)
        .join("");
    }
    return renderShadedParagraphs(
      block.content,
      fontCss,
      block.variant === "definition" ? definitionFill("html") : WORD_THEME.neutral.html,
    );
  }
  if (block.type === "hr") {
    return `<p ${base} style="border-bottom:1px solid #ccc;margin:12px 0;">&nbsp;</p>`;
  }
  if (block.type === "image") {
    return renderImageBlock(block, includeImages, fontCss);
  }
  if (block.type === "table") {
    let tableHtml = `<table dir="rtl" style="border-collapse:collapse;direction:rtl;width:100%;font-family:${fontCss};font-size:11pt;margin:0 0 12pt 0;">`;
    tableHtml += "<tr>";
    for (const cell of block.header) {
      tableHtml += `<th style="border:1px solid #999;padding:6px 8px;text-align:right;background:#D9E2F3;font-weight:bold;">${renderInlineForWord(cell)}</th>`;
    }
    tableHtml += "</tr>";
    for (const row of block.rows) {
      tableHtml += "<tr>";
      for (let column = 0; column < block.header.length; column += 1) {
        tableHtml += `<td style="border:1px solid #999;padding:6px 8px;text-align:right;direction:rtl;">${renderInlineForWord(row[column] || "")}</td>`;
      }
      tableHtml += "</tr>";
    }
    tableHtml += "</table>";
    return tableHtml;
  }
  if (block.type === "ul") {
    return renderNestedList(block, fontCss, false);
  }
  if (block.type === "ol") {
    return renderNestedList(block, fontCss, true);
  }
  if (block.type === "callout") {
    const inner = block.blocks
      .map((child) => renderSingleBlock(child, includeImages, fontCss, true))
      .join("");
    return renderShadedSection(inner, fontCss, calloutFill(block.variant, "html"));
  }
  return "";
}

function wrapClipboardDocument(bodyHtml, fontCss) {
  return `<html xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" dir="rtl"><head><meta charset="utf-8"><style>
body { direction: rtl; text-align: right; font-family: ${fontCss}; font-size: 12pt; color: #000; }
p, li { margin-bottom: 12pt; }
ol, ul { direction: rtl; text-align: right; margin-bottom: 12pt; }
math { direction: ltr; unicode-bidi: embed; display: inline; }
</style></head><body dir="rtl">${bodyHtml}</body></html>`;
}

/** Returns full HTML document for Word paste (NotebookLM-style). */
export function renderWordClipboardHtml(blocks, { includeImages = false, fontId = "assistant" } = {}) {
  const font = resolveWordFont(fontId);
  const expanded = expandCalloutSections(blocks);
  let body = "";

  for (const block of expanded) {
    body += renderSingleBlock(block, includeImages, font.css);
  }

  return wrapClipboardDocument(body, font.css);
}

export async function copyHtmlToClipboard(html, plainText) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  const temp = document.createElement("div");
  temp.innerHTML = html;
  temp.style.position = "fixed";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  const range = document.createRange();
  range.selectNodeContents(temp);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("copy");
  selection.removeAllRanges();
  document.body.removeChild(temp);
}
