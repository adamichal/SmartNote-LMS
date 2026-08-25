import { MERMAID_DIAGRAM_START, sanitizeMermaidSource } from "./mermaidSanitize";

export { sanitizeMermaidSource, MERMAID_DIAGRAM_START } from "./mermaidSanitize";

const PROGRAMMING_LANG = /language-(?:python|javascript|typescript|java|cpp|c|cs|sql|bash|sh|json|html|css|xml|go|rust)\b/;

export function extractMermaidSource(raw) {
  let text = (raw || "").trim();
  if (!text) return "";

  const wrappedFence = text.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n?```\s*$/);
  if (wrappedFence) {
    text = wrappedFence[1].trim();
  }

  if (text.startsWith("```mermaid")) {
    text = text.replace(/^```mermaid\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  }

  return sanitizeMermaidSource(text);
}

export function looksLikeMermaid(raw) {
  const source = extractMermaidSource(raw);
  return MERMAID_DIAGRAM_START.test(source);
}

export function isMermaidCodeElement(element) {
  if (!element || element.nodeName !== "CODE") return false;

  const className = element.className || "";
  if (typeof className === "string") {
    if (PROGRAMMING_LANG.test(className)) return false;
    if (className.includes("language-mermaid")) return true;
  }

  if (element.getAttribute("data-language") === "mermaid") return true;

  const parent = element.parentElement;
  if (parent?.nodeName === "PRE" && parent.classList.contains("mermaid")) return true;

  return looksLikeMermaid(element.textContent || "");
}

const FENCED_BLOCK = /```([^\n`]*)\n([\s\S]*?)```/g;

export function normalizeMermaidFencesInMarkdown(markdown) {
  if (!markdown) return markdown;

  return markdown.replace(FENCED_BLOCK, (full, language, body) => {
    const lang = (language || "").trim().toLowerCase();
    if (lang === "mermaid") {
      const cleaned = sanitizeMermaidSource(body.trim());
      return `\`\`\`mermaid\n${cleaned}\n\`\`\``;
    }

    const trimmed = body.trim();
    const nestedFence = trimmed.match(/^```mermaid\s*\n([\s\S]*?)\n?```\s*$/i);
    if (nestedFence) {
      return `\`\`\`mermaid\n${sanitizeMermaidSource(nestedFence[1].trim())}\n\`\`\``;
    }

    if (MERMAID_DIAGRAM_START.test(trimmed)) {
      return `\`\`\`mermaid\n${sanitizeMermaidSource(trimmed)}\n\`\`\``;
    }

    return full;
  });
}
