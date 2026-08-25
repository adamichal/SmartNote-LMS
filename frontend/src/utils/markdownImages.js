import { formatNotebookContent } from "./notebookFormat";

function stripMermaidBlocks(markdown) {
  return (markdown || "").replace(/```mermaid\s*\n[\s\S]*?```/gi, "");
}

function lectureImageApiPrefix(courseName, lectureId) {
  return `/api/courses/${encodeURIComponent(courseName)}/lectures/${encodeURIComponent(lectureId)}/images/`;
}

export function imageApiUrl(courseName, lectureId, filename) {
  return `${lectureImageApiPrefix(courseName, lectureId)}${encodeURIComponent(filename)}`;
}
function normalizeImageFilename(filename) {
  const name = (filename || "").trim().replace(/\\/g, "/").split("/").pop();
  if (!name) return filename;

  const pageMatch = name.match(/^page_(\d+)\.png$/i);
  if (pageMatch) {
    return `page_${String(parseInt(pageMatch[1], 10)).padStart(3, "0")}.png`;
  }

  const slideMatch = name.match(/^slide_(\d+)\.png$/i);
  if (slideMatch) {
    return `page_${String(parseInt(slideMatch[1], 10)).padStart(3, "0")}.png`;
  }

  return name;
}

function extractImageFilename(src) {
  const trimmed = (src || "").trim();
  const relativeMatch = trimmed.match(/^(?:\.\/)?extracted_images\/(.+)$/i);
  if (relativeMatch) return normalizeImageFilename(relativeMatch[1]);

  const barePageMatch = trimmed.match(/^(?:\.\/)?((?:page|slide)_\d+\.png)$/i);
  if (barePageMatch) return normalizeImageFilename(barePageMatch[1]);

  const apiPrefixMatch = trimmed.match(/\/images\/([^/?#]+)$/);
  if (apiPrefixMatch) {
    try {
      return normalizeImageFilename(decodeURIComponent(apiPrefixMatch[1]));
    } catch {
      return normalizeImageFilename(apiPrefixMatch[1]);
    }
  }

  return null;
}

export function rewriteImageSrc(src, courseName, lectureId) {
  if (!src || !courseName || !lectureId) return src;

  const filename = extractImageFilename(src);
  if (filename) {
    return imageApiUrl(courseName, lectureId, filename);
  }

  const legacyPrefix = `/api/lectures/${encodeURIComponent(lectureId)}/images/`;
  if (src.startsWith(legacyPrefix)) {
    const legacyFilename = decodeURIComponent(src.slice(legacyPrefix.length));
    return imageApiUrl(courseName, lectureId, normalizeImageFilename(legacyFilename));
  }

  return src;
}

export function prepareMarkdownForDisplay(markdown, courseName, lectureId) {
  const formatted = formatNotebookContent(stripMermaidBlocks(markdown));
  return formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const resolved = rewriteImageSrc(src.trim(), courseName, lectureId);    return resolved === src.trim() ? match : `![${alt}](${resolved})`;
  });
}

export function prepareMarkdownForSave(markdown, courseName, lectureId) {
  const apiPrefix = lectureImageApiPrefix(courseName, lectureId);
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const trimmed = src.trim();
    if (trimmed.startsWith(apiPrefix)) {
      const filename = decodeURIComponent(trimmed.slice(apiPrefix.length));
      return `![${alt}](./extracted_images/${filename})`;
    }

    const filename = extractImageFilename(trimmed);
    if (filename) {
      return `![${alt}](./extracted_images/${filename})`;
    }

    return match;
  });
}
