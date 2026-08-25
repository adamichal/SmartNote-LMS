const SPECIAL_IN_LABEL = /[\s:?#&(),'"`;]|[\u0590-\u05FF]/;

export const MERMAID_DIAGRAM_START =
  /^(?:flowchart|graph|sequenceDiagram|erDiagram|stateDiagram(?:-v2)?|classDiagram(?:-v2)?|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|sankey(?:-beta)?|c4Context|requirementDiagram|zenuml|architecture(?:-beta)?|kanban)\b/i;

function quoteMermaidLabel(label) {
  const trimmed = (label || "").trim();
  if (!trimmed) return '""';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed;
  return `"${trimmed.replace(/"/g, "'")}"`;
}

function needsQuotes(label) {
  const trimmed = (label || "").trim();
  if (!trimmed) return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return false;
  }
  return SPECIAL_IN_LABEL.test(trimmed);
}

function stripTrailingSemicolon(line) {
  return line.replace(/;\s*$/, "");
}

function sanitizeFlowchartLine(line) {
  let result = stripTrailingSemicolon(line);

  result = result.replace(
    /(\bsubgraph\s+[\w-]+)\[([^\]"]+)\]/gi,
    (match, prefix, label) => (needsQuotes(label) ? `${prefix}[${quoteMermaidLabel(label)}]` : match),
  );

  result = result.replace(
    /([\w\u0590-\u05FF-]+)\{\{([^}"]+)\}\}/gu,
    (match, id, label) => (needsQuotes(label) ? `${id}{{${quoteMermaidLabel(label)}}}` : match),
  );

  result = result.replace(
    /([\w\u0590-\u05FF-]+)\{([^}"]+)\}/gu,
    (match, id, label) => (needsQuotes(label) ? `${id}{${quoteMermaidLabel(label)}}` : match),
  );

  result = result.replace(
    /([\w\u0590-\u05FF-]+)\[([^\]"]+)\]/gu,
    (match, id, label) => (needsQuotes(label) ? `${id}[${quoteMermaidLabel(label)}]` : match),
  );

  result = result.replace(
    /([\w\u0590-\u05FF-]+)\(([^)"]+)\)/gu,
    (match, id, label) => {
      const inner = label.trim();
      if (inner.startsWith("[") || inner.startsWith("{")) return match;
      return needsQuotes(label) ? `${id}(${quoteMermaidLabel(label)})` : match;
    },
  );

  result = result.replace(
    /\|([^|"]+)\|/g,
    (match, label) => (needsQuotes(label) ? `|${quoteMermaidLabel(label)}|` : match),
  );

  return result;
}

function sanitizeMindmapLine(line) {
  return line.replace(
    /\(\(([^)"]+)\)\)/g,
    (match, label) => (needsQuotes(label) ? `((${quoteMermaidLabel(label)}))` : match),
  );
}

function sanitizeSequenceLine(line) {
  return line.replace(
    /\b(as\s+)([^:\n;]+)/gi,
    (match, prefix, label) => (needsQuotes(label) ? `${prefix}${quoteMermaidLabel(label)}` : match),
  );
}

function diagramKind(source) {
  const first = source.trim().split("\n").find((line) => line.trim() && !line.trim().startsWith("%%"));
  if (!first) return "unknown";
  const match = first.match(MERMAID_DIAGRAM_START);
  return match ? match[0].toLowerCase() : "unknown";
}

/** Fix common AI-generated Mermaid syntax issues (especially Hebrew labels). */
export function sanitizeMermaidSource(raw) {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  text = text.replace(/[\u200E\u200F\u202A-\u202E]/g, "");

  const kind = diagramKind(text);
  const lines = text.split("\n");

  const sanitized = lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) return line;

    if (index === 0 && MERMAID_DIAGRAM_START.test(trimmed)) {
      return stripTrailingSemicolon(trimmed);
    }

    if (kind.startsWith("flowchart") || kind === "graph") {
      return sanitizeFlowchartLine(line);
    }
    if (kind === "mindmap") {
      return sanitizeMindmapLine(line);
    }
    if (kind === "sequencediagram") {
      return sanitizeSequenceLine(line);
    }
    return stripTrailingSemicolon(line);
  });

  return sanitized.join("\n").trim();
}
