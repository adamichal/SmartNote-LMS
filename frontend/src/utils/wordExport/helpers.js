export function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function fixRtlBrackets(value) {
  return value.replace(/\[/g, "\u200F[").replace(/\]/g, "]\u200F");
}

const PUNCT_AFTER = /^[,.\:;!?\)\]\}،׃\-]/;
const PUNCT_BEFORE = /[\(\[\{\-]$/;

export function needSpaceBefore(segments, index) {
  if (index <= 0) return false;
  const previous = segments[index - 1];
  if (previous.type !== "text" || previous.value.length === 0) return false;
  if (PUNCT_BEFORE.test(previous.value)) return false;
  return true;
}

export function needSpaceAfter(segments, index) {
  if (index >= segments.length - 1) return false;
  const next = segments[index + 1];
  if (next.type !== "text" || next.value.length === 0) return false;
  if (PUNCT_AFTER.test(next.value)) return false;
  return true;
}
