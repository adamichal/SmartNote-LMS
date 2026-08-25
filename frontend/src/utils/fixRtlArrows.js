const ARROW_CHARS = /(←|→|⇒|⇐|⟹|⟸|↔|⟷|—>)/;

const SKIP_SELECTOR =
  "code, pre, .katex, .mmd, .notebook-diagram, .notebook-diagram svg, .notebook-arrow";

function shouldSkipNode(textNode) {
  const parent = textNode.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest(SKIP_SELECTOR));
}

export function fixRtlArrows(container) {
  if (!container) return;

  container.querySelectorAll(".notebook-arrow").forEach((element) => {
    const text = element.textContent || "";
    element.replaceWith(document.createTextNode(text));
  });

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const value = textNode.textContent || "";
    if (!ARROW_CHARS.test(value) || shouldSkipNode(textNode)) continue;

    const parts = value.split(/(←|→|⇒|⇐|⟹|⟸|↔|⟷|—>)/);
    if (parts.length < 2) continue;

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) continue;
      if (index % 2 === 1) {
        const span = document.createElement("span");
        span.className = "notebook-arrow";
        span.setAttribute("dir", "ltr");
        span.setAttribute("aria-hidden", "true");
        span.textContent = part;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}
