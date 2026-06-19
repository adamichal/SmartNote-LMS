const IMAGE_PATH_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function imageApiUrl(lectureId, filename) {
  return `/api/lectures/${encodeURIComponent(lectureId)}/images/${encodeURIComponent(filename)}`;
}

export function rewriteImageSrc(src, lectureId) {
  if (!src || !lectureId) return src;
  const normalized = src.replace(/\\/g, "/");
  if (
    normalized.startsWith("/api/") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:")
  ) {
    return normalized;
  }

  let filename = normalized;
  if (normalized.includes("extracted_images/")) {
    filename = normalized.split("extracted_images/").pop().split("?")[0];
  } else {
    filename = normalized.replace(/^\.?\//, "");
  }

  return imageApiUrl(lectureId, filename);
}

export function prepareMarkdownForDisplay(markdown, lectureId) {
  return markdown.replace(IMAGE_PATH_PATTERN, (match, alt, src) => {
    const resolved = rewriteImageSrc(src.trim(), lectureId);
    return `![${alt}](${resolved})`;
  });
}

export function prepareMarkdownForSave(markdown, lectureId) {
  const apiPrefix = `/api/lectures/${encodeURIComponent(lectureId)}/images/`;
  return markdown.replace(IMAGE_PATH_PATTERN, (match, alt, src) => {
    let normalized = src.trim();
    if (normalized.startsWith(apiPrefix)) {
      const filename = decodeURIComponent(normalized.slice(apiPrefix.length));
      normalized = `./extracted_images/${filename}`;
    }
    return `![${alt}](${normalized})`;
  });
}
