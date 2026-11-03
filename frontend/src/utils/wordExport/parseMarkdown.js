import {
  detectCalloutVariant,
  isDefinitionText,
  normalizeMixedScriptSpacing,
} from "./helpers";
import { applySemanticListNesting, listIndentLevel, orderedListIndentLevel } from "./listTree";
import { parseOrderedListLine, unescapeMarkdownInline } from "./normalizeMarkdown";

const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const ORPHAN_ASTERISK_LINE = /^\*+$/;
const HEADING_LINE = /^(#{1,4})\s+(.+)$/;

function cleanInline(content) {
  return normalizeMixedScriptSpacing(unescapeMarkdownInline(content));
}

function isListLine(stripped, line) {
  if (/^\*\s/.test(stripped) || /^-\s/.test(stripped) || /^\+\s/.test(stripped)) {
    return true;
  }
  return /^\s+[-*+]\s/.test(line);
}

function parseListItem(stripped, line) {
  const content = cleanInline(stripped.replace(/^[-*+]\s*/, ""));
  if (!content.trim()) return null;

  return {
    type: "ul-item",
    content,
    indent: listIndentLevel(line),
  };
}

function peekNextNonEmpty(lines, startIndex) {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const stripped = lines[i].trim();
    if (stripped) return { line: lines[i], stripped };
  }
  return null;
}

function isUpcomingList(lines, startIndex) {
  const next = peekNextNonEmpty(lines, startIndex);
  if (!next) return false;
  return isListLine(next.stripped, next.line) || Boolean(parseOrderedListLine(next.stripped));
}

function shouldTreatColonLineAsHeading(stripped, blocks, lines, index, hasExplicitHeading) {
  if (!stripped.endsWith(":")) return false;
  if (stripped.startsWith("*") || stripped.startsWith("-") || /^\d+\./.test(stripped)) return false;
  if (stripped.startsWith(" ")) return false;
  if (stripped.length >= 100) return false;

  const label = stripped.replace(/:$/, "").trim();
  if (detectCalloutVariant(label)) return true;

  // Intro text before a list — e.g. "להלן הנקודות:" then bullet items
  if (isUpcomingList(lines, index)) return false;

  const previous = blocks[blocks.length - 1];
  if (previous && /^h[1-4]$/.test(previous.type)) return false;

  if (!hasExplicitHeading && blocks.length === 0) return true;

  // Sentence-like lines (commas, long) are body text, not headings
  if (stripped.length > 50 || /[,،]/.test(stripped) || /\.\s/.test(stripped)) return false;

  return stripped.length <= 45;
}

export function parseNotebookMarkdown(text) {
  const lines = text.trim().split("\n");
  const blocks = [];
  let hasExplicitHeading = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const stripped = line.trim();
    if (!stripped) {
      index += 1;
      continue;
    }

    if (ORPHAN_ASTERISK_LINE.test(stripped)) {
      index += 1;
      continue;
    }

    if (stripped.startsWith("|") && stripped.endsWith("|")) {
      const tableRows = [];
      while (
        index < lines.length &&
        lines[index].trim().startsWith("|") &&
        lines[index].trim().endsWith("|")
      ) {
        const row = lines[index].trim();
        if (/^[|\s\-:]+$/.test(row)) {
          index += 1;
          continue;
        }
        const cells = row
          .split("|")
          .slice(1, -1)
          .map((cell) => cleanInline(cell.trim()));
        if (cells.length > 0 && cells.some((cell) => cell.length > 0)) {
          tableRows.push(cells);
        }
        index += 1;
      }
      if (tableRows.length > 0) {
        blocks.push({ type: "table", header: tableRows[0], rows: tableRows.slice(1) });
      }
      continue;
    }

    if (stripped.startsWith(">")) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(cleanInline(lines[index].trim().replace(/^>\s?/, "")));
        index += 1;
      }
      const content = quoteLines.join("\n");
      blocks.push({
        type: "blockquote",
        content,
        variant: isDefinitionText(content) ? "definition" : "default",
      });
      continue;
    }

    const imageMatch = stripped.match(IMAGE_LINE_PATTERN);
    if (imageMatch) {
      blocks.push({ type: "image", alt: imageMatch[1], src: imageMatch[2] });
      index += 1;
      continue;
    }

    const headingMatch = stripped.match(HEADING_LINE);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = cleanInline(headingMatch[2].trim());
      hasExplicitHeading = true;
      const calloutVariant = level === 2 ? detectCalloutVariant(content) : null;
      blocks.push({
        type: `h${level}`,
        content,
        calloutVariant,
      });
      index += 1;
      continue;
    }

    const ordered = parseOrderedListLine(stripped);
    if (ordered) {
      blocks.push({
        type: "ol-item",
        content: normalizeMixedScriptSpacing(ordered.content),
        num: ordered.num,
        indent: orderedListIndentLevel(line),
      });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(stripped)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (shouldTreatColonLineAsHeading(stripped, blocks, lines, index, hasExplicitHeading)) {
      const content = cleanInline(stripped.replace(/:$/, ""));
      if (!hasExplicitHeading && blocks.length === 0) {
        blocks.push({ type: "h1", content, calloutVariant: null });
        hasExplicitHeading = true;
      } else {
        blocks.push({ type: "h2", content, calloutVariant: detectCalloutVariant(content) });
      }
      index += 1;
      continue;
    }

    if (/^שיטה \d+:/.test(stripped) || /^שלב \d+:/.test(stripped)) {
      blocks.push({ type: "h2", content: cleanInline(stripped), calloutVariant: null });
      index += 1;
      continue;
    }

    if (isListLine(stripped, line)) {
      const listItem = parseListItem(stripped, line);
      if (listItem) {
        blocks.push(listItem);
      }
      index += 1;
      continue;
    }

    if (!hasExplicitHeading && blocks.length === 0) {
      blocks.push({ type: "h1", content: cleanInline(stripped), calloutVariant: null });
      hasExplicitHeading = true;
    } else {
      blocks.push({ type: "p", content: cleanInline(stripped) });
    }

    index += 1;
  }

  const grouped = [];
  for (const block of blocks) {
    if (block.type === "ul-item" || block.type === "ol-item") {
      const listType = block.type === "ul-item" ? "ul" : "ol";
      const previous = grouped[grouped.length - 1];
      if (previous?.type === listType) {
        previous.items.push(block);
      } else {
        grouped.push({ type: listType, items: [block], start: block.num || 1 });
      }
    } else {
      grouped.push(block);
    }
  }

  return grouped.filter((block) => {
    if (block.type !== "ul" && block.type !== "ol") return true;
    const items = block.items.filter((item) => item.content?.trim());
    if (!items.length) return false;
    block.items = block.type === "ul" ? applySemanticListNesting(items) : items;
    return true;
  });
}
