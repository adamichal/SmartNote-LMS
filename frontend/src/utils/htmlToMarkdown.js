import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

turndown.use(gfm);

turndown.addRule("katexInline", {
  filter(node) {
    return (
      node.nodeName === "SPAN" &&
      node.classList.contains("katex") &&
      !node.classList.contains("katex-display")
    );
  },
  replacement(_content, node) {
    const annotation = node.querySelector("annotation[encoding='application/x-tex']");
    if (annotation?.textContent) {
      return `$${annotation.textContent}$`;
    }
    return node.textContent || "";
  },
});

turndown.addRule("katexBlock", {
  filter(node) {
    return node.nodeName === "SPAN" && node.classList.contains("katex-display");
  },
  replacement(_content, node) {
    const annotation = node.querySelector("annotation[encoding='application/x-tex']");
    if (annotation?.textContent) {
      return `\n\n$$${annotation.textContent}$$\n\n`;
    }
    return `\n\n${node.textContent || ""}\n\n`;
  },
});

turndown.addRule("preserveLineBreaks", {
  filter: "br",
  replacement: () => "\n",
});

turndown.addRule("notebookFigureCaption", {
  filter(node) {
    return node.nodeName === "FIGCAPTION";
  },
  replacement() {
    return "";
  },
});

turndown.addRule("notebookDefinition", {
  filter(node) {
    return node.nodeName === "BLOCKQUOTE" && node.classList.contains("notebook-definition");
  },
  replacement(content) {
    const lines = content.trim().split("\n").filter(Boolean);
    return `\n\n${lines.map((line) => `> ${line}`).join("\n")}\n\n`;
  },
});

turndown.addRule("notebookFigure", {
  filter(node) {
    return node.nodeName === "FIGURE" && node.classList.contains("notebook-figure");
  },
  replacement(_content, node) {
    const image = node.querySelector("img");
    if (!image) return "";
    const alt = image.getAttribute("alt") || "";
    const src = image.getAttribute("src") || "";
    return `\n\n![${alt}](${src})\n\n`;
  },
});

turndown.addRule("mermaidDiagram", {
  filter(node) {
    return node.nodeName === "DIV" && node.classList.contains("notebook-diagram");
  },
  replacement(_content, node) {
    const source = node.getAttribute("data-mermaid-source") || "";
    return `\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n`;
  },
});

turndown.addRule("mermaidPre", {
  filter(node) {
    return node.nodeName === "PRE" && node.classList.contains("mermaid");
  },
  replacement(_content, node) {
    const source =
      node.getAttribute("data-mermaid-source") || node.textContent?.trim() || "";
    return `\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n`;
  },
});

turndown.addRule("notebookPassThrough", {
  filter(node) {
    return (
      (node.nodeName === "HEADER" && node.classList.contains("notebook-hero")) ||
      (node.nodeName === "DIV" &&
        (node.classList.contains("notebook-meta") || node.classList.contains("notebook-callout"))) ||
      (node.nodeName === "SECTION" && node.classList.contains("notebook-section"))
    );
  },
  replacement(content) {
    return `\n\n${content}\n\n`;
  },
});

export function htmlToMarkdown(html) {
  const cleaned = html
    .replace(/\sdata-callout-icon="[^"]*"/gi, "")
    .replace(/\sclass="notebook-section__heading"/gi, "")
    .replace(/\sclass="notebook-table"/gi, "")
    .replace(/<span class="notebook-arrow"[^>]*>(.*?)<\/span>/gi, "$1");
  return turndown
    .turndown(cleaned)
    .replace(/^\s*[-*+•](?:\s*[-*+•])*\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
