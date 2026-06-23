import { prepareMarkdownForDisplay } from "../markdownImages";
import { buildDocxBlob } from "./docxBuilder";
import { parseNotebookMarkdown } from "./parseMarkdown";
import { copyHtmlToClipboard, renderWordClipboardHtml } from "./wordClipboard";

const MAX_CLIPBOARD_HTML_CHARS = 1_500_000;

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function renderClipboardHtmlInChunks(blocks, options) {
  const chunkSize = 40;
  let body = "";

  for (let start = 0; start < blocks.length; start += chunkSize) {
    const slice = blocks.slice(start, start + chunkSize);
    body += renderWordClipboardHtml(slice, options);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  return `<html xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" dir="rtl"><head><meta charset="utf-8"><style>
body { direction: rtl; text-align: right; font-family: David, 'Noto Sans Hebrew', serif; font-size: 12pt; }
math { direction: ltr; unicode-bidi: embed; display: inline; }
</style></head><body dir="rtl">${body}</body></html>`;
}

export async function downloadNotebookDocx(markdown, filename, lectureId) {
  const blocks = parseNotebookMarkdown(prepareMarkdownForDisplay(markdown, lectureId));
  const blob = await buildDocxBlob(blocks);
  triggerDownload(blob, filename.endsWith(".docx") ? filename : `${filename}.docx`);
}

export async function copyNotebookToWord(markdown, lectureId) {
  const displayMarkdown = prepareMarkdownForDisplay(markdown, lectureId);
  const blocks = parseNotebookMarkdown(displayMarkdown);

  const html = await renderClipboardHtmlInChunks(blocks, { includeImages: false });

  if (html.length > MAX_CLIPBOARD_HTML_CHARS) {
    throw new Error(
      "המחברת גדולה מדי להעתקה. השתמשי ב'הורד Word' או ייצוא PDF.",
    );
  }

  const plainText = displayMarkdown.length > 500_000
    ? `${displayMarkdown.slice(0, 500_000)}\n\n[... הטקסט קוצר ...]`
    : displayMarkdown;

  await copyHtmlToClipboard(html, plainText);
}
