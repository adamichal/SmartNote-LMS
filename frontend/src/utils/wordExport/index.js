import JSZip from "jszip";
import { getNotebook } from "../../api/client";
import { formatNotebookContent } from "../notebookFormat";
import { prepareMarkdownForDisplay } from "../markdownImages";
import { buildDocxBlob } from "./docxBuilder";
import { resolveBlockImages } from "./imageResolver";
import { normalizeMarkdownForWordExport } from "./normalizeMarkdown";
import { parseNotebookMarkdown } from "./parseMarkdown";
import { copyHtmlToClipboard, renderWordClipboardHtml } from "./wordClipboard";

const MAX_CLIPBOARD_HTML_CHARS = 1_500_000;
const MIN_DOCX_BYTES = 1024;

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

async function prepareBlocks(markdown, courseName, lectureId, { includeImages = false } = {}) {
  const prepared = normalizeMarkdownForWordExport(
    formatNotebookContent(
      prepareMarkdownForDisplay(markdown, courseName, lectureId),
    ),
  );
  const blocks = parseNotebookMarkdown(prepared);
  if (!includeImages) return blocks;
  return resolveBlockImages(blocks);
}

async function buildValidatedDocxBlob(blocks, options) {
  const blob = await buildDocxBlob(blocks, options);
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength < MIN_DOCX_BYTES) {
    throw new Error("קובץ Word שנוצר פגום (גודל קטן מדי)");
  }
  if (buffer.byteLength > 80 * 1024 * 1024) {
    throw new Error("המחברת גדולה מדי ל-Word — נסי להוריד בלי תמונות");
  }
  return { blob, buffer, byteLength: buffer.byteLength };
}

export async function downloadNotebookDocx(
  markdown,
  filename,
  courseName,
  lectureId,
  { fontId = "assistant", includeImages = true } = {},
) {
  const blocks = await prepareBlocks(markdown, courseName, lectureId, { includeImages });
  const { blob } = await buildValidatedDocxBlob(blocks, { fontId, includeImages });
  triggerDownload(blob, filename.endsWith(".docx") ? filename : `${filename}.docx`);
}

function sanitizeZipEntryName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

export function buildLectureDocxFilename(number, topic) {
  return `${sanitizeZipEntryName(`הרצאה ${number} - ${topic}`)}.docx`;
}

export async function downloadCourseNotebooksDocxZip(
  courseName,
  lectures,
  { fontId = "assistant", includeImages = true, onProgress } = {},
) {
  const ready = [...lectures]
    .filter((lecture) => lecture.status === "completed")
    .sort((a, b) => Number(a.number) - Number(b.number) || String(a.topic).localeCompare(String(b.topic), "he"));

  if (!ready.length) {
    throw new Error("אין מחברות מוכנות לייצוא");
  }

  const zip = new JSZip();
  const usedNames = new Set();
  const failed = [];
  let exported = 0;

  for (let index = 0; index < ready.length; index += 1) {
    const lecture = ready[index];
    onProgress?.({ done: index, total: ready.length, lecture });

    try {
      const { content } = await getNotebook(courseName, lecture.id);
      const blocks = await prepareBlocks(content, courseName, lecture.id, { includeImages });
      const { buffer } = await buildValidatedDocxBlob(blocks, { fontId, includeImages });

      let filename = buildLectureDocxFilename(lecture.number, lecture.topic);
      if (usedNames.has(filename)) {
        filename = buildLectureDocxFilename(lecture.number, `${lecture.topic} (${lecture.id})`);
      }
      usedNames.add(filename);

      // DOCX is already a ZIP — store without re-compressing to avoid corruption/OOM.
      zip.file(filename, buffer, { compression: "STORE" });
      exported += 1;
    } catch (error) {
      failed.push({
        lecture,
        message: typeof error?.message === "string" ? error.message : "ייצוא נכשל",
      });
    }
  }

  onProgress?.({ done: ready.length, total: ready.length });

  if (!exported) {
    throw new Error("ייצוא Word נכשל עבור כל המחברות");
  }

  if (failed.length) {
    const lines = failed.map(
      (item) => `הרצאה ${item.lecture.number} - ${item.lecture.topic}: ${item.message}`,
    );
    zip.file("_export_errors.txt", `${lines.join("\n")}\n`);
  }

  zip.file(
    "_README.txt",
    [
      "הוראות פתיחה:",
      "1. חלצי את כל הקבצים מה-ZIP לתיקייה במחשב (לחיצה ימנית → Extract All).",
      "2. אל תפתחי קבצי Word ישירות מתוך ה-ZIP — Word עלול להציג שגיאת דיסק/הרשאות.",
      "3. לאחר החילוץ, פתחי כל קובץ .docx מתיקיית היעד.",
      "",
    ].join("\n"),
  );

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const zipName = `${sanitizeZipEntryName(courseName)}_מחברות_Word.zip`;
  triggerDownload(zipBlob, zipName);

  return { exported, failed: failed.length };
}

export async function copyNotebookToWord(
  markdown,
  courseName,
  lectureId,
  { fontId = "assistant", includeImages = false } = {},
) {
  const blocks = await prepareBlocks(markdown, courseName, lectureId, { includeImages });
  const displayMarkdown = normalizeMarkdownForWordExport(
    prepareMarkdownForDisplay(markdown, courseName, lectureId),
  );

  const html = renderWordClipboardHtml(blocks, { includeImages, fontId });

  if (html.length > MAX_CLIPBOARD_HTML_CHARS) {
    throw new Error(
      "המחברת גדולה מדי להעתקה. השתמשי ב'הורד Word' (עדיף בלי תמונות אם הקובץ גדול).",
    );
  }

  const plainText = displayMarkdown.length > 500_000
    ? `${displayMarkdown.slice(0, 500_000)}\n\n[... הטקסט קוצר ...]`
    : displayMarkdown;

  await copyHtmlToClipboard(html, plainText);
}

export { getWordExportFont, setWordExportFont, WORD_FONTS } from "./config";
