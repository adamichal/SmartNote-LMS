const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

export function parseNotebookMarkdown(text) {
  const lines = text.trim().split("\n");
  const blocks = [];
  let isFirst = true;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const stripped = line.trim();
    if (!stripped) {
      isFirst = false;
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
        if (/^[\|\s\-:]+$/.test(row)) {
          index += 1;
          continue;
        }
        const cells = row
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
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
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    const imageMatch = stripped.match(IMAGE_LINE_PATTERN);
    if (imageMatch) {
      blocks.push({ type: "image", alt: imageMatch[1], src: imageMatch[2] });
      index += 1;
      continue;
    }

    if (stripped.startsWith("#### ")) {
      blocks.push({ type: "h4", content: stripped.slice(5).trim() });
    } else if (stripped.startsWith("### ")) {
      blocks.push({ type: "h3", content: stripped.slice(4).trim() });
    } else if (stripped.startsWith("## ")) {
      blocks.push({ type: "h2", content: stripped.slice(3).trim() });
    } else if (stripped.startsWith("# ")) {
      blocks.push({ type: "h1", content: stripped.slice(2).trim() });
    } else if (/^[-*_]{3,}$/.test(stripped)) {
      blocks.push({ type: "hr" });
    } else if (
      stripped.endsWith(":") &&
      !stripped.startsWith("*") &&
      !stripped.startsWith("-") &&
      !/^\d+\./.test(stripped) &&
      !stripped.startsWith(" ") &&
      stripped.length < 100
    ) {
      if (isFirst) {
        blocks.push({ type: "h1", content: stripped.replace(/:$/, "") });
        isFirst = false;
      } else {
        blocks.push({ type: "h2", content: stripped.replace(/:$/, "") });
      }
    } else if (/^\d+\.\s/.test(stripped)) {
      const num = Number.parseInt(stripped.match(/^(\d+)\./)[1], 10);
      blocks.push({
        type: "ol-item",
        content: stripped.replace(/^\d+\.\s*/, ""),
        num,
      });
    } else if (/^\*\s/.test(stripped) || /^-\s/.test(stripped)) {
      blocks.push({
        type: "ul-item",
        content: stripped.replace(/^[\*\-]\s*/, ""),
        indent: 0,
      });
    } else if (/^\s+[\*\-]\s/.test(line)) {
      const indent = line.search(/\S/);
      blocks.push({
        type: "ul-item",
        content: stripped.replace(/^[\*\-]\s*/, ""),
        indent: Math.floor(indent / 2),
      });
    } else if (isFirst) {
      blocks.push({ type: "h1", content: stripped });
      isFirst = false;
    } else {
      blocks.push({ type: "p", content: stripped });
    }

    if (isFirst && stripped) isFirst = false;
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

  return grouped;
}
