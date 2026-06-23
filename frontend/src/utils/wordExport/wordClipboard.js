import katex from "katex";
import { escapeHtml, fixRtlBrackets } from "./helpers";
import {
  needSpaceAfter,
  needSpaceBefore,
  prepareInlineSegments,
} from "./inlineSegments";

const NON_BREAKING_SPACE = "\u00A0";

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
        const mathWithSpaces = `${spaceBefore}${mathml}${spaceAfter}`;
        html += segment.bold ? `<b>${mathWithSpaces}</b>` : mathWithSpaces;
      } catch {
        const raw = `<span dir="ltr" style="font-family:'Cambria Math',serif;">$${escapeHtml(segment.value)}$</span>`;
        html += segment.bold ? `<b>${raw}</b>` : raw;
      }
    } else if (segment.type === "code") {
      const codeHtml = `<code style="font-family:'Courier New',monospace; direction:ltr; unicode-bidi:embed;">${escapeHtml(segment.value)}</code>`;
      html += segment.bold ? `<b>${codeHtml}</b>` : codeHtml;
    } else {
      const escaped = fixRtlBrackets(escapeHtml(segment.value));
      html += segment.bold ? `<b>${escaped}</b>` : escaped;
    }
  }

  return html;
}

function blockStyle(level) {
  const sizes = { h1: "16pt", h2: "14pt", h3: "13pt", h4: "12pt", p: "12pt" };
  const size = sizes[level] || sizes.p;
  return `dir="rtl" style="text-align:right; direction:rtl; font-family:David,'Noto Sans Hebrew',serif; font-size:${size}; line-height:1.6; margin:6px 0;"`;
}

function renderImagePlaceholder(alt) {
  const label = alt?.trim() || "שקף מההרצאה";
  return `<p ${blockStyle("p")}><em style="color:#64748b;">[תמונה: ${escapeHtml(label)}]</em></p>`;
}

/** Returns inner body HTML only (no html/head wrapper) for chunked rendering. */
export function renderWordClipboardHtml(blocks, { includeImages = false } = {}) {
  let body = "";

  for (const block of blocks) {
    if (block.type === "h1") {
      body += `<h1 ${blockStyle("h1")} style="font-weight:bold;">${renderInlineForWord(block.content)}</h1>`;
    } else if (block.type === "h2") {
      body += `<h2 ${blockStyle("h2")} style="font-weight:bold; color:#2E4057;">${renderInlineForWord(block.content)}</h2>`;
    } else if (block.type === "h3") {
      body += `<h3 ${blockStyle("h3")} style="font-weight:bold;">${renderInlineForWord(block.content)}</h3>`;
    } else if (block.type === "h4") {
      body += `<h4 ${blockStyle("h4")} style="font-weight:bold;">${renderInlineForWord(block.content)}</h4>`;
    } else if (block.type === "p") {
      body += `<p ${blockStyle("p")}>${renderInlineForWord(block.content)}</p>`;
    } else if (block.type === "blockquote") {
      body += `<blockquote ${blockStyle("p")} style="border-right:4px solid #6366f1; background:#eef2ff; padding:8px 12px;">${renderInlineForWord(block.content)}</blockquote>`;
    } else if (block.type === "hr") {
      body += '<hr style="border:none;border-top:1px solid #ccc;margin:12px 0;" />';
    } else if (block.type === "image") {
      if (includeImages && block.dataUrl) {
        body += `<p ${blockStyle("p")}><img src="${escapeHtml(block.dataUrl)}" alt="${escapeHtml(block.alt || "")}" style="max-width:480px; display:block; margin:8px auto;" /></p>`;
      } else {
        body += renderImagePlaceholder(block.alt);
      }
    } else if (block.type === "table") {
      body += '<table dir="rtl" style="border-collapse:collapse; direction:rtl; width:100%; font-family:David,serif; font-size:11pt; margin:8px 0;">';
      body += "<tr>";
      for (const cell of block.header) {
        body += `<th style="border:1px solid #999; padding:6px 8px; text-align:right; background:#D9E2F3; font-weight:bold;">${renderInlineForWord(cell)}</th>`;
      }
      body += "</tr>";
      for (const row of block.rows) {
        body += "<tr>";
        for (let column = 0; column < block.header.length; column += 1) {
          body += `<td style="border:1px solid #999; padding:6px 8px; text-align:right; direction:rtl;">${renderInlineForWord(row[column] || "")}</td>`;
        }
        body += "</tr>";
      }
      body += "</table>";
    } else if (block.type === "ul") {
      body += `<ul dir="rtl" style="text-align:right; direction:rtl; font-family:David,serif; font-size:12pt; margin:4px 24px 4px 0;">`;
      for (const item of block.items) {
        const indent = (item.indent || 0) * 24;
        body += `<li style="text-align:right; direction:rtl; margin-right:${indent}px;">${renderInlineForWord(item.content)}</li>`;
      }
      body += "</ul>";
    } else if (block.type === "ol") {
      const startAttr = block.start > 1 ? ` start="${block.start}"` : "";
      body += `<ol${startAttr} dir="rtl" style="text-align:right; direction:rtl; font-family:David,serif; font-size:12pt; margin:4px 24px 4px 0;">`;
      for (const item of block.items) {
        body += `<li style="text-align:right; direction:rtl;">${renderInlineForWord(item.content)}</li>`;
      }
      body += "</ol>";
    }
  }

  return body;
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
