import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { extractMermaidSource } from "./mermaidNormalize";

const MERMAID_FENCE = /```mermaid\s*\n?([\s\S]*?)```/gi;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mermaidPreHtml(source) {
  const cleaned = extractMermaidSource(source);
  return `<pre class="mermaid">${escapeHtml(cleaned)}</pre>`;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function markdownToHtml(markdown) {
  const mermaidBlocks = [];

  const withoutMermaid = markdown.replace(MERMAID_FENCE, (_match, source) => {
    const index = mermaidBlocks.length;
    mermaidBlocks.push(source.trim());
    return `\n\n<div data-mermaid-placeholder="${index}"></div>\n\n`;
  });

  let html = String(await processor.process(withoutMermaid));

  for (let index = 0; index < mermaidBlocks.length; index += 1) {
    const pre = mermaidPreHtml(mermaidBlocks[index]);
    html = html.replace(
      new RegExp(`<p>\\s*<div data-mermaid-placeholder="${index}"></div>\\s*</p>`, "g"),
      pre,
    );
    html = html.replace(
      new RegExp(`<div data-mermaid-placeholder="${index}"></div>`, "g"),
      pre,
    );
  }

  return html;
}
