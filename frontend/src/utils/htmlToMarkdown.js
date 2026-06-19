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

export function htmlToMarkdown(html) {
  return turndown.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}
