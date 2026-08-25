const BOX_DRAWING = /[┌┐└┘│─├┤┬┴┼▼▲▾▸◀▶╔╗╚╝═║]/;
const TREE_BRANCH = /[├└│]/;

import { sanitizeMermaidSource } from "./mermaidSanitize";

function sanitizeMermaidLabel(label) {
  return label.trim().replace(/\s+/g, " ").replace(/"/g, "'").slice(0, 120);
}

function isProgrammingCode(text) {
  return (
    /^\s*(def |function |import |from |const |let |var |class |public |private |#include|SELECT |INSERT |async )/m.test(
      text,
    ) ||
    (/[{};]/.test(text) && /(function|return|const|let|var)\b/.test(text))
  );
}

export function isAsciiDiagram(text) {
  const source = text?.trim();
  if (!source || source.length < 16) return false;
  if (isProgrammingCode(source)) return false;

  const boxChars = (source.match(BOX_DRAWING) || []).length;
  const treeChars = (source.match(TREE_BRANCH) || []).length;
  if (boxChars < 3 && treeChars < 2) return false;

  const labels = extractLabelsFromBoxDiagram(source);
  return labels.length >= 2;
}

function extractLabelsFromBoxDiagram(text) {
  const lines = text.split("\n");
  const rowMap = new Map();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!BOX_DRAWING.test(line) && !line.includes("│")) continue;

    const parts = line
      .split("│")
      .map((segment) => sanitizeMermaidLabel(segment.replace(BOX_DRAWING, "")))
      .filter((segment) => {
        if (segment.length < 3) return false;
        if (/^[─\s\-_]+$/.test(segment)) return false;
        return true;
      });

    const unique = [...new Set(parts)];
    if (unique.length) rowMap.set(lineIndex, unique);
  }

  const lineNums = [...rowMap.keys()].sort((a, b) => a - b);
  const rows = [];
  let index = 0;

  while (index < lineNums.length) {
    const lineNum = lineNums[index];
    let labels = [...rowMap.get(lineNum)];

    const canMergeWithNext =
      labels.length === 1 &&
      labels[0].split(" ").length === 1 &&
      index + 1 < lineNums.length &&
      lineNums[index + 1] - lineNum <= 2;

    if (canMergeWithNext) {
      const nextLabels = rowMap.get(lineNums[index + 1]);
      if (nextLabels?.length === 1 && nextLabels[0].split(" ").length === 1) {
        labels = [`${labels[0]} ${nextLabels[0]}`];
        index += 1;
      }
    }

    const mergedKey = labels.join("|").toLowerCase();
    const lastRow = rows[rows.length - 1];
    if (!lastRow || lastRow.join("|").toLowerCase() !== mergedKey) {
      rows.push(labels);
    }
    index += 1;
  }

  return rows.filter((row) => row.some((label) => label.length >= 4));
}

function parseTreeDiagram(text) {
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.some((line) => TREE_BRANCH.test(line))) return null;

  const nodes = [];
  const edges = [];
  const stack = [];

  function nodeId(label) {
    const existing = nodes.find((node) => node.label === label);
    if (existing) return existing.id;
    const id = `n${nodes.length}`;
    nodes.push({ id, label });
    return id;
  }

  for (const line of lines) {
    const branchMatch = line.match(/^([\s│]*)([├└])?[─\s│]*(.+?)\s*$/);
    if (!branchMatch) continue;

    const prefix = branchMatch[1] || "";
    const branch = branchMatch[2] || "";
    const rawLabel = branchMatch[3].replace(BOX_DRAWING, "").trim();
    if (!rawLabel || rawLabel.length < 2) continue;

    const label = sanitizeMermaidLabel(rawLabel);
    const depth = branch
      ? (prefix.match(/│/g) || []).length + 1
      : Math.max(0, (prefix.match(/│/g) || []).length);

    const id = nodeId(label);
    stack.length = depth;
    stack[depth] = id;

    if (depth > 0 && stack[depth - 1]) {
      edges.push([stack[depth - 1], id]);
    }
  }

  if (nodes.length < 2) return null;
  return { nodes, edges };
}

function rowsToFlowchart(rows) {
  const ids = new Map();
  let counter = 0;
  const nodeId = (label) => {
    if (!ids.has(label)) {
      ids.set(label, `n${counter}`);
      counter += 1;
    }
    return ids.get(label);
  };

  const lines = ["flowchart TD"];

  for (const row of rows) {
    for (const label of row) {
      lines.push(`    ${nodeId(label)}["${label.replace(/"/g, "'")}"]`);
    }
  }

  for (let index = 0; index < rows.length - 1; index += 1) {
    const from = rows[index];
    const to = rows[index + 1];

    if (from.length === 1) {
      for (const target of to) {
        lines.push(`    ${nodeId(from[0])} --> ${nodeId(target)}`);
      }
    } else if (to.length === 1) {
      for (const source of from) {
        lines.push(`    ${nodeId(source)} --> ${nodeId(to[0])}`);
      }
    } else if (from.length === 1 && to.length === 1) {
      lines.push(`    ${nodeId(from[0])} --> ${nodeId(to[0])}`);
    } else {
      for (const source of from) {
        lines.push(`    ${nodeId(source)} --> ${nodeId(to[0])}`);
      }
    }
  }

  return lines.join("\n");
}

function graphToMermaid(graph) {
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) {
    lines.push(`    ${node.id}["${node.label.replace(/"/g, "'")}"]`);
  }
  for (const [from, to] of graph.edges) {
    lines.push(`    ${from} --> ${to}`);
  }
  return lines.join("\n");
}

export function asciiDiagramToMermaid(text) {
  const source = text?.trim();
  if (!source || !isAsciiDiagram(source)) return null;

  const tree = parseTreeDiagram(source);
  if (tree) return sanitizeMermaidSource(graphToMermaid(tree));

  const rows = extractLabelsFromBoxDiagram(source);
  if (rows.length < 2) return null;

  return sanitizeMermaidSource(rowsToFlowchart(rows));
}

const FENCED_BLOCK = /```([^\n`]*)\n([\s\S]*?)```/g;

export function convertAsciiDiagramsInMarkdown(markdown) {
  if (!markdown) return markdown;

  return markdown.replace(FENCED_BLOCK, (full, language, body) => {
    const lang = (language || "").trim().toLowerCase();
    if (lang && !["", "text", "ascii", "diagram"].includes(lang)) return full;
    if (lang === "mermaid") return full;

    const mermaid = asciiDiagramToMermaid(body);
    if (!mermaid) return full;

    return `\`\`\`mermaid\n${mermaid}\n\`\`\``;
  });
}

export function convertAsciiDiagramElement(codeElement) {
  const source = codeElement?.textContent?.trim();
  const mermaid = asciiDiagramToMermaid(source);
  if (!mermaid) return false;

  codeElement.className = "language-mermaid";
  codeElement.textContent = mermaid;
  codeElement.parentElement?.classList?.add("mermaid");
  return true;
}
