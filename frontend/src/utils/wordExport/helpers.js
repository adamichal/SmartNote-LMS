const HEBREW_CHAR = /[\u0590-\u05FF]/;
const HEBREW_TOKEN = /[\u0590-\u05FF\u05F0-\u05F4\u05BE\u05F3\u05F4]+/;
const LTR_TOKEN =
  /[A-Za-z0-9](?:[A-Za-z0-9\s=<>+\-*/(),%°]*[A-Za-z0-9.)])?|[A-Za-z0-9]+/;
const ARROW_TOKEN = /(?:→|->)/;
const DEFINITION_PATTERN = /הגדרה\s*[—\-–:]/u;

/** Shared Word / clipboard color palette — clean blues, purple definitions, green concepts. */
export const WORD_THEME = {
  heading: { h1: "1E3A5F", h2: "2A4A6F", h3: "365A85", h4: "4A7FAD" },
  text: "000000",
  definition: { html: "#F3EEF8", docx: "F3EEF8" },
  concept: { html: "#E8F5EC", docx: "E8F5EC" },
  neutral: { html: "#F5F5F5", docx: "F5F5F5" },
  callout: {
    summary: { html: "#EFF6FF", docx: "EFF6FF" },
    context: { html: "#EFF6FF", docx: "EFF6FF" },
    exam: { html: "#FFF0F5", docx: "FFF0F5" },
    diff: { html: "#FFF0F5", docx: "FFF0F5" },
  },
};

/** @deprecated use WORD_THEME */
export const WORD_PARAGRAPH_SHADE = WORD_THEME.neutral.html;
/** @deprecated use WORD_THEME */
export const WORD_PARAGRAPH_SHADE_DOCX = WORD_THEME.neutral.docx;

export function calloutFill(variant, format = "html") {
  const key = format === "docx" ? "docx" : "html";
  return WORD_THEME.callout[variant]?.[key] || WORD_THEME.neutral[key];
}

export function definitionFill(format = "html") {
  const key = format === "docx" ? "docx" : "html";
  return WORD_THEME.definition[key];
}

export const CALLOUT_STYLES = {
  summary: {
    title: /סיכום(?:\s*מהיר|\s*ונקודות מפתח)?/,
  },
  context: {
    title: /מיקום בקורס/,
  },
  exam: {
    title: /נקודות למבחן/,
  },
  diff: {
    title: /נושאים מהמצגת|לא נדונו/,
  },
};

export function detectCalloutVariant(text) {
  const value = text || "";
  for (const [variant, style] of Object.entries(CALLOUT_STYLES)) {
    if (style.title.test(value)) return variant;
  }
  return null;
}

export function isDefinitionText(text) {
  return DEFINITION_PATTERN.test(text || "");
}

const SECTION_BREAK = /^h[12]$/;

export function expandCalloutSections(blocks) {
  const expanded = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    if (block.type === "h2" && block.calloutVariant) {
      const sectionBlocks = [block];
      index += 1;
      while (index < blocks.length && !SECTION_BREAK.test(blocks[index].type)) {
        sectionBlocks.push(blocks[index]);
        index += 1;
      }
      expanded.push({
        type: "callout",
        variant: block.calloutVariant,
        blocks: sectionBlocks,
      });
      continue;
    }

    expanded.push(block);
    index += 1;
  }

  return expanded;
}

/** Insert spaces between digits and adjacent Hebrew letters; fix common RTL period glitches. */
export function normalizeMixedScriptSpacing(text) {
  if (!text) return "";
  return text
    .replace(/(\d)([\u0590-\u05FF])/g, "$1 $2")
    .replace(/([\u0590-\u05FF])(\d)(?=[\u0590-\u05FF])/g, "$1 $2")
    .replace(/([A-Za-z0-9.)])\s+([.,;:!?])/g, "$1$2")
    .replace(/\.([\u0590-\u05FF][^\n]*?)(\s*)$/gm, (_, middle, trailing) => `${middle}.${trailing}`)
    .replace(/(\*\*[^*]+\*\*)([\u0590-\u05FF])/g, "$1 $2")
    .replace(/(\*\*[^*]+\*\*)(\d)/g, "$1 $2")
    .replace(/:([\u0590-\u05FF])/g, ": $1")
    .replace(/(?<!\d):(\d)/g, ": $1")
    .replace(/[ \t]{2,}/g, " ");
}

function tokenizeMixedText(text) {
  const tokens = [];
  let index = 0;

  while (index < text.length) {
    const slice = text.slice(index);

    const parenMatch = slice.match(/^\([^)\n]+\)/);
    if (parenMatch) {
      let value = parenMatch[0];
      let consumed = value.length;
      const trailPunct = slice.slice(consumed).match(/^[.,;:!?]+/);
      if (trailPunct && /[A-Za-z0-9=<>]/.test(value)) {
        value += trailPunct[0];
        consumed += trailPunct[0].length;
      }
      tokens.push({ direction: "ltr", value });
      index += consumed;
      continue;
    }

    const bracketMatch = slice.match(/^\[[^\]\n]+\]/);
    if (bracketMatch) {
      const hasLatin = /[A-Za-z0-9]/.test(bracketMatch[0]);
      tokens.push({ direction: hasLatin ? "ltr" : "rtl", value: bracketMatch[0] });
      index += bracketMatch[0].length;
      continue;
    }

    const arrowMatch = slice.match(ARROW_TOKEN);
    if (arrowMatch && arrowMatch.index === 0) {
      tokens.push({ direction: "ltr", value: arrowMatch[0] });
      index += arrowMatch[0].length;
      continue;
    }

    const hebrewMatch = slice.match(HEBREW_TOKEN);
    if (hebrewMatch && hebrewMatch.index === 0) {
      tokens.push({ direction: "rtl", value: hebrewMatch[0] });
      index += hebrewMatch[0].length;
      continue;
    }

    const ltrMatch = slice.match(LTR_TOKEN);
    if (ltrMatch && ltrMatch.index === 0) {
      tokens.push({ direction: "ltr", value: ltrMatch[0] });
      index += ltrMatch[0].length;
      continue;
    }

    const spaceMatch = slice.match(/^\s+/);
    if (spaceMatch) {
      tokens.push({ direction: "neutral", value: spaceMatch[0] });
      index += spaceMatch[0].length;
      continue;
    }

    const punctMatch = slice.match(/^[.,;:!?״׳]+/);
    if (punctMatch) {
      tokens.push({ direction: "neutral", value: punctMatch[0] });
      index += punctMatch[0].length;
      continue;
    }

    tokens.push({ direction: "rtl", value: slice[0] });
    index += 1;
  }

  return tokens;
}

function mergeTokens(tokens) {
  if (!tokens.length) return [];

  const merged = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (token.direction === "neutral" && previous) {
      previous.value += token.value;
      continue;
    }
    merged.push({ ...token });
  }
  return merged;
}

function attachTrailingPunctuationToLtr(runs) {
  const result = [];
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const next = runs[index + 1];
    if (
      run.direction === "ltr" &&
      next?.direction === "rtl" &&
      /^[.,;:!?]+$/.test(next.value.trim())
    ) {
      result.push({ direction: "ltr", value: `${run.value}${next.value.trim()}` });
      index += 1;
      continue;
    }
    result.push(run);
  }
  return result;
}

export function splitBidiTextRuns(text) {
  const normalized = normalizeMixedScriptSpacing(text);
  if (!normalized) return [];
  if (!HEBREW_CHAR.test(normalized)) {
    return [{ direction: "ltr", value: normalized }];
  }

  const tokens = mergeTokens(tokenizeMixedText(normalized));
  const runs = attachTrailingPunctuationToLtr(tokens.filter((token) => token.direction !== "neutral"));
  return runs.filter((run) => run.value.length > 0);
}

export function isolateEmbeddedLtr(text) {
  return text;
}

export function fixRtlBrackets(value) {
  if (!value) return "";
  return value.replace(/\[/g, "\u200F[").replace(/\]/g, "]\u200F");
}

const PUNCT_AFTER = /^[,.\:;!?\)\]\}،׃\-]/;
const PUNCT_BEFORE = /[\(\[\{\-]$/;

export function needSpaceBefore(segments, index) {
  if (index <= 0) return false;
  const previous = segments[index - 1];
  if (previous.type !== "text" || previous.value.length === 0) return false;
  if (PUNCT_BEFORE.test(previous.value)) return false;
  return true;
}

export function needSpaceAfter(segments, index) {
  if (index >= segments.length - 1) return false;
  const next = segments[index + 1];
  if (next.type !== "text" || next.value.length === 0) return false;
  if (PUNCT_AFTER.test(next.value)) return false;
  return true;
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip characters illegal in XML 1.0 text nodes. */
export function sanitizeXmlText(value) {
  if (!value) return "";
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "");
}

export function escapeXml(value) {
  return sanitizeXmlText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function scaleImageDimensions(width, height, maxWidthPx = 480) {
  if (!width || !height) {
    return { width: maxWidthPx, height: Math.round(maxWidthPx * 0.67) };
  }
  if (width <= maxWidthPx) {
    return { width, height };
  }
  const scale = maxWidthPx / width;
  return { width: maxWidthPx, height: Math.round(height * scale) };
}

export function pxToEmu(px) {
  return Math.round(px * 914400 / 96);
}
