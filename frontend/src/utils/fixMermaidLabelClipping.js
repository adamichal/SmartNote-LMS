const LABEL_PAD_X = 28;
const LABEL_PAD_Y = 12;

function parseNum(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function expandShape(shape, widthDelta, heightDelta) {
  const tag = shape.tagName?.toLowerCase();
  if (tag === "rect") {
    const w = parseNum(shape.getAttribute("width"));
    const h = parseNum(shape.getAttribute("height"));
    if (w > 0) {
      shape.setAttribute("width", String(w + widthDelta));
      shape.setAttribute("x", String(parseNum(shape.getAttribute("x")) - widthDelta / 2));
    }
    if (h > 0 && heightDelta > 0) {
      shape.setAttribute("height", String(h + heightDelta));
      shape.setAttribute("y", String(parseNum(shape.getAttribute("y")) - heightDelta / 2));
    }
    return;
  }

  if (tag === "polygon") {
    const points = shape.getAttribute("points");
    if (!points) return;
    const coords = points.trim().split(/\s+/).map(parseNum);
    if (coords.length < 6) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      minX = Math.min(minX, coords[i]);
      maxX = Math.max(maxX, coords[i]);
      minY = Math.min(minY, coords[i + 1]);
      maxY = Math.max(maxY, coords[i + 1]);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scaleX = (maxX - minX + widthDelta) / (maxX - minX);
    const scaleY =
      heightDelta > 0 ? (maxY - minY + heightDelta) / (maxY - minY) : 1;

    const next = [];
    for (let i = 0; i < coords.length; i += 2) {
      next.push(cx + (coords[i] - cx) * scaleX, cy + (coords[i + 1] - cy) * scaleY);
    }
    shape.setAttribute("points", next.join(" "));
  }
}

function measureLabelContent(content) {
  content.style.direction = "rtl";
  content.style.unicodeBidi = "plaintext";
  content.style.textAlign = "center";
  content.style.overflow = "visible";
  content.style.whiteSpace = "nowrap";
  content.style.display = "inline-block";
  content.style.width = "max-content";
  content.style.maxWidth = "none";

  const width = Math.ceil(content.scrollWidth || content.getBoundingClientRect().width);
  const height = Math.ceil(content.scrollHeight || content.getBoundingClientRect().height);
  return { width, height };
}

function fixHtmlLabelNode(nodeGroup) {
  const foreignObject = nodeGroup.querySelector("foreignObject");
  if (!foreignObject) return false;

  const content =
    foreignObject.querySelector(".nodeLabel") ||
    foreignObject.querySelector("div") ||
    foreignObject.querySelector("span");
  if (!content) return false;

  const measured = measureLabelContent(content);
  const foWidth = parseNum(foreignObject.getAttribute("width"));
  const foHeight = parseNum(foreignObject.getAttribute("height"));
  const neededWidth = measured.width + LABEL_PAD_X;
  const neededHeight = measured.height + LABEL_PAD_Y;

  const widthDelta = Math.max(0, neededWidth - foWidth);
  const heightDelta = Math.max(0, neededHeight - foHeight);
  if (widthDelta === 0 && heightDelta === 0) return false;

  foreignObject.setAttribute("width", String(foWidth + widthDelta));
  foreignObject.setAttribute("x", String(parseNum(foreignObject.getAttribute("x")) - widthDelta / 2));

  if (heightDelta > 0) {
    foreignObject.setAttribute("height", String(foHeight + heightDelta));
    foreignObject.setAttribute("y", String(parseNum(foreignObject.getAttribute("y")) - heightDelta / 2));
  }

  nodeGroup.querySelectorAll("rect, polygon").forEach((shape) => {
    expandShape(shape, widthDelta, heightDelta);
  });

  content.style.whiteSpace = "normal";
  content.style.width = "100%";
  content.style.maxWidth = "100%";
  return widthDelta > 0 || heightDelta > 0;
}

function fixSvgLabelNode(nodeGroup) {
  const labelGroup = nodeGroup.querySelector("g.label");
  const text = labelGroup?.querySelector("text");
  if (!text) return false;

  text.setAttribute("direction", "rtl");
  text.setAttribute("unicode-bidi", "plaintext");

  const bbox = text.getBBox();
  const shapes = [...nodeGroup.querySelectorAll("rect, polygon")];
  if (!shapes.length) return false;

  const shape = shapes[0];
  let shapeWidth = 0;
  let shapeHeight = 0;

  if (shape.tagName.toLowerCase() === "rect") {
    shapeWidth = parseNum(shape.getAttribute("width"));
    shapeHeight = parseNum(shape.getAttribute("height"));
  } else {
    const box = shape.getBBox();
    shapeWidth = box.width;
    shapeHeight = box.height;
  }

  const neededWidth = bbox.width + LABEL_PAD_X;
  const neededHeight = bbox.height + LABEL_PAD_Y;
  const widthDelta = Math.max(0, neededWidth - shapeWidth);
  const heightDelta = Math.max(0, neededHeight - shapeHeight);
  if (widthDelta === 0 && heightDelta === 0) return false;

  shapes.forEach((s) => expandShape(s, widthDelta, heightDelta));
  return true;
}

/** Widen Mermaid node boxes when label text (especially RTL) was measured too narrow. */
export function fixMermaidLabelClipping(svgRoot) {
  if (!svgRoot) return;

  svgRoot.querySelectorAll("g.node, g.actor, g.task").forEach((nodeGroup) => {
    if (!fixHtmlLabelNode(nodeGroup)) {
      fixSvgLabelNode(nodeGroup);
    }
  });

  svgRoot.querySelectorAll("foreignObject").forEach((fo) => {
    fo.setAttribute("overflow", "visible");
  });

  expandViewBoxIfNeeded(svgRoot);
}

function expandViewBoxIfNeeded(svgRoot, pad = 16) {
  const current = svgRoot.getAttribute("viewBox");
  if (!current) return;

  const parts = current.split(/\s+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return;

  const [vx, vy, vw, vh] = parts;
  if (vw < 1 || vh < 1) return;

  let minX = vx;
  let minY = vy;
  let maxX = vx + vw;
  let maxY = vy + vh;

  try {
    const bbox = svgRoot.getBBox();
    if (bbox.width > 1 && bbox.height > 1) {
      minX = Math.min(minX, bbox.x);
      minY = Math.min(minY, bbox.y);
      maxX = Math.max(maxX, bbox.x + bbox.width);
      maxY = Math.max(maxY, bbox.y + bbox.height);
    }
  } catch {
    return;
  }

  const nextViewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  if (maxX - minX + pad * 2 < 1 || maxY - minY + pad * 2 < 1) return;

  svgRoot.setAttribute("viewBox", nextViewBox);
}
