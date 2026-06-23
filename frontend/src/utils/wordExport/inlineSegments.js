import { needSpaceAfter, needSpaceBefore } from "./helpers";

const INLINE_PATTERN =
  /\$\$([^$]+)\$\$|\$([^$]+)\$|`([^`]+)`|\*\*(.+?)\*\*|\*([^*\n]+?)\*/g;

export function splitInlineSegments(text) {
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      parts.push({ type: "math", value: match[1], display: true });
    } else if (match[2] !== undefined) {
      parts.push({ type: "math", value: match[2], display: false });
    } else if (match[3] !== undefined) {
      parts.push({ type: "code", value: match[3] });
    } else if (match[4] !== undefined) {
      for (const segment of splitInlineSegments(match[4])) {
        parts.push({ ...segment, bold: true });
      }
    } else if (match[5] !== undefined) {
      for (const segment of splitInlineSegments(match[5])) {
        parts.push({ ...segment, bold: true });
      }
    }

    lastIndex = INLINE_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts;
}

export function normalizeSpacesAroundMath(segments) {
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index].type === "math") {
      if (index > 0 && segments[index - 1].type === "text") {
        segments[index - 1].value = segments[index - 1].value.replace(/\s+$/, "");
      }
      if (index < segments.length - 1 && segments[index + 1].type === "text") {
        segments[index + 1].value = segments[index + 1].value.replace(/^\s+/, "");
      }
    }
  }
  return segments;
}

export function prepareInlineSegments(text) {
  return normalizeSpacesAroundMath(splitInlineSegments(text));
}

export { needSpaceBefore, needSpaceAfter };
