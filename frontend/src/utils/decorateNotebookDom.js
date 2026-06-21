const CALLOUT_RULES = [
  { match: /סיכום מהיר/, className: "notebook-callout notebook-callout--summary" },
  { match: /נקודות למבחן/, className: "notebook-callout notebook-callout--exam" },
  { match: /נושאים מהמצגת|לא נדונו/, className: "notebook-callout notebook-callout--diff" },
];

function isSectionBreak(element) {
  return element?.nodeType === 1 && /^H[12]$/.test(element.tagName);
}

function wrapCalloutSection(heading, className) {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  heading.parentNode.insertBefore(wrapper, heading);
  wrapper.appendChild(heading);

  let sibling = wrapper.nextSibling;
  while (sibling && !isSectionBreak(sibling)) {
    const next = sibling.nextSibling;
    wrapper.appendChild(sibling);
    sibling = next;
  }
}

export function decorateNotebookDom(container) {
  if (!container) return;

  container.querySelectorAll(".notebook-callout").forEach((element) => {
    while (element.firstChild) {
      element.parentNode.insertBefore(element.firstChild, element);
    }
    element.remove();
  });

  container.querySelectorAll("h2").forEach((heading) => {
    const text = heading.textContent || "";
    const rule = CALLOUT_RULES.find((item) => item.match.test(text));
    if (rule) wrapCalloutSection(heading, rule.className);
  });

  container.querySelectorAll("img").forEach((image) => {
    image.classList.add("notebook-image");
    image.loading = "lazy";
    if (!image.alt) image.alt = "שקף מההרצאה";
  });

  container.querySelectorAll("table").forEach((table) => {
    if (!table.parentElement?.classList.contains("notebook-table-wrap")) {
      const wrap = document.createElement("div");
      wrap.className = "notebook-table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
  });
}
