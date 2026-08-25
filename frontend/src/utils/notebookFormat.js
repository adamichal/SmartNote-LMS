/** Light notebook cleanup (metadata lines only). */

const METADATA_LINE = /^\*\*(?:קורס|הרצאה|תאריך עיבוד):/;

export function formatNotebookContent(content) {
  if (!content) return content;
  const result = content
    .split("\n")
    .filter((line) => !METADATA_LINE.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result;
}
