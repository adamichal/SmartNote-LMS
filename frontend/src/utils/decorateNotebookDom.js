const CALLOUT_RULES = [
  {
    match: /סיכום(?:\s*מהיר|\s*ונקודות מפתח)?/,
    className: "notebook-callout notebook-callout--summary",
  },
  {
    match: /מיקום בקורס/,
    className: "notebook-callout notebook-callout--context",
  },
  {
    match: /נקודות למבחן/,
    className: "notebook-callout notebook-callout--exam",
  },
  {
    match: /נושאים מהמצגת|לא נדונו/,
    className: "notebook-callout notebook-callout--diff",
  },
];

function isSectionBreak(element) {
  return element?.nodeType === 1 && /^H[12]$/.test(element.tagName);
}

function unwrapDecorations(container) {
  container.querySelectorAll(".notebook-callout").forEach((element) => {
    while (element.firstChild) {
      element.parentNode.insertBefore(element.firstChild, element);
    }
    element.remove();
  });

  container.querySelectorAll("section.notebook-section").forEach((section) => {
    while (section.firstChild) {
      section.parentNode.insertBefore(section.firstChild, section);
    }
    section.remove();
  });

  container.querySelectorAll("header.notebook-hero").forEach((hero) => {
    while (hero.firstChild) {
      hero.parentNode.insertBefore(hero.firstChild, hero);
    }
    hero.remove();
  });

  container.querySelectorAll(".notebook-definition").forEach((element) => {
    element.classList.remove("notebook-definition");
  });

  container.querySelectorAll(".notebook-section__heading").forEach((element) => {
    element.classList.remove("notebook-section__heading");
  });

  container.querySelectorAll("[data-callout-icon]").forEach((element) => {
    delete element.dataset.calloutIcon;
  });
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

function decorateHero(container) {
  const firstHeading = container.querySelector(":scope > h1:first-child");
  if (!firstHeading || firstHeading.closest("header.notebook-hero")) return;

  const hero = document.createElement("header");
  hero.className = "notebook-hero";
  firstHeading.parentNode.insertBefore(hero, firstHeading);
  hero.appendChild(firstHeading);

  const meta = document.createElement("div");
  meta.className = "notebook-meta";
  let hasMeta = false;

  let node = hero.nextSibling;
  while (node) {
    if (node.nodeType === 1 && node.tagName === "HR") break;
    if (node.nodeType === 1 && node.tagName === "P") {
      const next = node.nextSibling;
      meta.appendChild(node);
      hasMeta = true;
      node = next;
      continue;
    }
    break;
  }

  if (hasMeta) {
    hero.appendChild(meta);
  }
}

function decorateSections(container) {
  container.querySelectorAll(":scope > h2").forEach((heading) => {
    if (heading.closest(".notebook-callout, .notebook-hero")) return;

    const section = document.createElement("section");
    section.className = "notebook-section";
    heading.classList.add("notebook-section__heading");
    heading.parentNode.insertBefore(section, heading);
    section.appendChild(heading);

    let sibling = section.nextSibling;
    while (sibling) {
      if (sibling.nodeType === 1 && /^H[12]$/.test(sibling.tagName)) break;
      const next = sibling.nextSibling;
      section.appendChild(sibling);
      sibling = next;
    }
  });
}

function slideCaptionFromImage(image) {
  const alt = image.alt?.trim();
  if (alt && alt !== "שקף מההרצאה") return alt;

  const src = image.getAttribute("src") || "";
  const pageMatch = src.match(/page_(\d+)\.png/i);
  if (pageMatch) {
    return `שקף ${parseInt(pageMatch[1], 10)}`;
  }

  return "שקף מההרצאה";
}

function unwrapNotebookFigures(container) {
  container.querySelectorAll("figure.notebook-figure").forEach((figure) => {
    const image = figure.querySelector("img");
    if (image) {
      figure.parentNode.insertBefore(image, figure);
    }
    figure.remove();
  });
}

function wrapImageInFigure(image) {
  if (image.closest("figure.notebook-figure")) return;

  const figure = document.createElement("figure");
  figure.className = "notebook-figure";

  const caption = document.createElement("figcaption");
  caption.className = "notebook-figure__caption";
  caption.textContent = slideCaptionFromImage(image);

  image.parentNode.insertBefore(figure, image);
  figure.appendChild(image);
  figure.appendChild(caption);
}

export function decorateNotebookDom(container) {
  if (!container) return;

  unwrapDecorations(container);
  unwrapNotebookFigures(container);

  decorateHero(container);

  container.querySelectorAll("h2").forEach((heading) => {
    if (heading.closest(".notebook-hero")) return;
    const text = heading.textContent || "";
    const rule = CALLOUT_RULES.find((item) => item.match.test(text));
    if (rule) {
      wrapCalloutSection(heading, rule.className);
    }
  });

  decorateSections(container);

  container.querySelectorAll("blockquote").forEach((quote) => {
    const text = quote.textContent || "";
    if (/הגדרה\s*[—\-–:]/u.test(text)) {
      quote.classList.add("notebook-definition");
    }
  });

  container.querySelectorAll("img").forEach((image) => {
    image.classList.add("notebook-image");
    image.loading = "lazy";
    image.title = "לחץ להגדלה";
    if (!image.alt) image.alt = "שקף מההרצאה";
    wrapImageInFigure(image);
  });

  container.querySelectorAll("table").forEach((table) => {
    if (!table.parentElement?.classList.contains("notebook-table-wrap")) {
      const wrap = document.createElement("div");
      wrap.className = "notebook-table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
    table.classList.add("notebook-table");
  });
}
