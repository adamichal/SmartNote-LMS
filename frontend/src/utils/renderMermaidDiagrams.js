import { convertAsciiDiagramElement } from "./asciiDiagramToMermaid";
import { fixMermaidLabelClipping } from "./fixMermaidLabelClipping";
import { extractMermaidSource } from "./mermaidNormalize";
import { getMermaid } from "./mermaidConfig";

let diagramCounter = 0;

function nextDiagramId() {
  diagramCounter += 1;
  return `smartnote-diagram-${diagramCounter}`;
}

function isSvgVisible(svgElement) {
  if (!svgElement) return false;

  const viewBox = svgElement.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return true;
  }

  const width = parseFloat(svgElement.getAttribute("width") || "");
  const height = parseFloat(svgElement.getAttribute("height") || "");
  if (width > 0 && height > 0) return true;

  try {
    const bbox = svgElement.getBBox();
    return bbox.width > 1 && bbox.height > 1;
  } catch {
    return false;
  }
}

function unwrapMermaidDiagrams(container) {
  container.querySelectorAll(".notebook-diagram[data-mermaid-source]").forEach((diagram) => {
    const source = diagram.getAttribute("data-mermaid-source") || "";
    const pre = document.createElement("pre");
    pre.className = "mermaid";
    pre.textContent = source;
    diagram.replaceWith(pre);
  });
}

function collectDiagramSources(container) {
  const items = [];
  const seen = new Set();

  function addItem(element, source) {
    if (!element || seen.has(element)) return;
    const cleaned = extractMermaidSource(source);
    if (!cleaned) return;
    seen.add(element);
    items.push({ element, source: cleaned });
  }

  for (const pre of container.querySelectorAll("pre.mermaid")) {
    addItem(pre, pre.textContent || "");
  }

  for (const code of container.querySelectorAll("pre > code")) {
    const parent = code.parentElement;
    if (!parent || parent.classList.contains("mermaid")) continue;

    convertAsciiDiagramElement(code);

    const className = code.className || "";
    const source = code.textContent || "";
    const isMermaidClass =
      typeof className === "string" && className.includes("language-mermaid");
    const looksMermaid =
      isMermaidClass ||
      /^(flowchart|graph|sequenceDiagram|erDiagram|stateDiagram|classDiagram|gantt|pie|gitGraph|mindmap)\b/i.test(
        source.trim(),
      );

    if (!looksMermaid) continue;
    addItem(parent, source);
  }

  return items;
}

function showDiagramError(element, message) {
  const box = document.createElement("div");
  box.className = "notebook-diagram-error";
  box.setAttribute("contenteditable", "false");
  box.textContent = `שגיאה בתרשים: ${message}`;
  element.replaceWith(box);
}

async function renderDiagramElement(mermaid, element, source) {
  const diagramId = nextDiagramId();
  const { svg, bindFunctions } = await mermaid.render(diagramId, source);

  if (!svg?.includes("<svg")) {
    throw new Error("SVG ריק");
  }

  const wrapper = document.createElement("div");
  wrapper.className = "notebook-diagram";
  wrapper.setAttribute("data-mermaid-source", source);
  wrapper.setAttribute("contenteditable", "false");
  wrapper.innerHTML = svg;
  bindFunctions?.(wrapper);

  element.replaceWith(wrapper);

  const svgElement = wrapper.querySelector("svg");
  if (svgElement) {
    fixMermaidLabelClipping(svgElement);

    svgElement.style.maxWidth = "100%";
    svgElement.style.height = "auto";
    svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

    if (!svgElement.getAttribute("viewBox")) {
      const width = svgElement.getAttribute("width");
      const height = svgElement.getAttribute("height");
      if (width && height) {
        svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }

    if (!isSvgVisible(svgElement)) {
      showDiagramError(wrapper, "התרשים לא נראה לאחר הרינדור");
      console.error("Mermaid invisible after render:", source);
      return;
    }
  }
}

export async function renderMermaidDiagrams(container) {
  if (!container) return;

  container.querySelectorAll(".notebook-diagram").forEach((diagram) => {
    const hasSource = diagram.getAttribute("data-mermaid-source");
    const svg = diagram.querySelector("svg");
    if (!svg && !hasSource) {
      diagram.remove();
    }
  });

  const mermaid = await getMermaid();
  unwrapMermaidDiagrams(container);

  const items = collectDiagramSources(container);
  if (!items.length) return;

  for (const { element, source } of items) {
    try {
      await renderDiagramElement(mermaid, element, source);
    } catch (error) {
      const message = error instanceof Error ? error.message : "לא ניתן לרנדר";
      showDiagramError(element, message);
      console.error("Mermaid render failed:", source, error);
    }
  }
}

export function insertMermaidTemplate(editor, source) {
  if (!editor) return;

  const pre = document.createElement("pre");
  pre.className = "mermaid";
  pre.textContent = source;

  editor.focus();
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    range.collapse(false);
    range.insertNode(document.createElement("br"));
    range.collapse(false);
    range.insertNode(pre);
    range.collapse(false);
    range.insertNode(document.createElement("br"));
  } else {
    editor.appendChild(document.createElement("br"));
    editor.appendChild(pre);
    editor.appendChild(document.createElement("br"));
  }
}
