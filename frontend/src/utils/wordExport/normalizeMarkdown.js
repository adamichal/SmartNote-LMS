/** Prepare notebook markdown for Word export (fixes turndown/HTML artifacts). */

const ORPHAN_ASTERISK_LINE = /^\s*\*+\s*$/;
const EMPTY_LIST_LINE = /^\s*[-*+•](?:\s*[-*+•])*\s*$/;
const ESCAPED_ORDERED_ITEM = /^(\d+)\\\.\s+(.*)$/;
const ORDERED_ITEM = /^(\d+)\.\s+(.*)$/;

export function unescapeMarkdownInline(text) {
  if (!text) return "";
  return text
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1")
    .replace(/\u200f/gi, "")
    .replace(/[\u2066\u2067\u2068\u2069]/g, "");
}

export function normalizeMarkdownLine(line) {
  let current = line;
  const trimmed = current.trim();

  if (!trimmed) return "";
  if (ORPHAN_ASTERISK_LINE.test(trimmed)) return "";
  if (EMPTY_LIST_LINE.test(trimmed)) return "";

  const emptyListItem = trimmed.match(/^[-*+•]\s+(.*)$/);
  if (emptyListItem && !emptyListItem[1].trim()) return "";

  const escapedOrdered = trimmed.match(ESCAPED_ORDERED_ITEM);
  if (escapedOrdered) {
    const content = unescapeMarkdownInline(escapedOrdered[2]);
    if (!content.trim()) return "";
    return `${escapedOrdered[1]}. ${content}`;
  }

  const plainOrdered = trimmed.match(ORDERED_ITEM);
  if (plainOrdered && !plainOrdered[2].trim()) return "";

  return unescapeMarkdownInline(current);
}

export function normalizeMarkdownForWordExport(markdown) {
  if (!markdown) return "";

  return markdown
    .split("\n")
    .map((line) => normalizeMarkdownLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseOrderedListLine(line) {
  const trimmed = line.trim();
  const escaped = trimmed.match(ESCAPED_ORDERED_ITEM);
  if (escaped) {
    const content = unescapeMarkdownInline(escaped[2]);
    if (!content.trim()) return null;
    return {
      num: Number.parseInt(escaped[1], 10),
      content,
    };
  }

  const plain = trimmed.match(ORDERED_ITEM);
  if (plain) {
    const content = unescapeMarkdownInline(plain[2]);
    if (!content.trim()) return null;
    return {
      num: Number.parseInt(plain[1], 10),
      content,
    };
  }

  return null;
}
