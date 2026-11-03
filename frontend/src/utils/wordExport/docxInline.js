import { escapeXml, sanitizeXmlText, splitBidiTextRuns } from "./helpers";
import { latexToOMML } from "./latexOmml";
import { needSpaceAfter, needSpaceBefore, prepareInlineSegments } from "./inlineSegments";

/** Escape for w:t — keep apostrophes literal (Word may show &apos; otherwise). */
function escapeDocxText(value) {
  return sanitizeXmlText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emphasisProps(segment) {
  const props = [];
  if (segment.bold) props.push("<w:b/><w:bCs/>");
  return props;
}

// rPr children must follow schema order: rFonts, b/bCs, ..., rtl, ..., lang
function buildCodeRun(text, segment) {
  if (!text) return "";
  const runProps = [
    '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>',
    ...emphasisProps(segment),
    '<w:lang w:val="en-US"/>',
  ];
  return `<w:r><w:rPr>${runProps.join("")}</w:rPr><w:t xml:space="preserve">${escapeDocxText(text)}</w:t></w:r>`;
}

function buildLtrTextRun(text, fontDocx, segment) {
  if (!text) return "";
  const runProps = [
    `<w:rFonts w:ascii="${escapeXml(fontDocx)}" w:hAnsi="${escapeXml(fontDocx)}" w:cs="Courier New" w:eastAsia="${escapeXml(fontDocx)}"/>`,
    ...emphasisProps(segment),
    '<w:lang w:val="en-US"/>',
  ];
  return `<w:r><w:rPr>${runProps.join("")}</w:rPr><w:t xml:space="preserve">${escapeDocxText(text)}</w:t></w:r>`;
}

function buildRtlTextRun(text, fontDocx, segment) {
  if (!text) return "";
  const runProps = [
    `<w:rFonts w:ascii="${escapeXml(fontDocx)}" w:hAnsi="${escapeXml(fontDocx)}" w:cs="${escapeXml(fontDocx)}" w:eastAsia="${escapeXml(fontDocx)}"/>`,
    ...emphasisProps(segment),
    "<w:rtl/>",
  ];
  return `<w:r><w:rPr>${runProps.join("")}</w:rPr><w:t xml:space="preserve">${escapeDocxText(text)}</w:t></w:r>`;
}

function buildTextRuns(text, fontDocx, segment) {
  const runs = splitBidiTextRuns(text);
  if (!runs.length) return buildRtlTextRun(text, fontDocx, segment);

  return runs
    .map((run) =>
      run.direction === "ltr"
        ? buildLtrTextRun(run.value, fontDocx, segment)
        : buildRtlTextRun(run.value, fontDocx, segment),
    )
    .join("");
}

/** Pull parentheses / trailing punctuation into the math LTR island. */
export function attachMathDelimiters(segments) {
  const result = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.type !== "math") {
      result.push({ ...segment });
      continue;
    }

    let leading = "";
    let trailing = "";

    const previous = result[result.length - 1];
    if (previous?.type === "text") {
      const openMatch = previous.value.match(/([([]\s*)$/);
      if (openMatch) {
        leading = openMatch[1];
        previous.value = previous.value.slice(0, -openMatch[1].length);
        if (!previous.value) result.pop();
      }
    }

    let nextIndex = index + 1;
    if (nextIndex < segments.length && segments[nextIndex].type === "text") {
      const closeMatch = segments[nextIndex].value.match(/^(\s*[)\]]+[.,;:!?]*\s*)/);
      if (closeMatch) {
        trailing = closeMatch[1];
        const remainder = segments[nextIndex].value.slice(closeMatch[1].length);
        result.push({
          type: "math",
          value: segment.value,
          display: segment.display,
          leading,
          trailing,
          bold: segment.bold,
        });
        if (remainder) {
          result.push({ type: "text", value: remainder, bold: segments[nextIndex].bold });
        }
        index = nextIndex;
        continue;
      }
    }

    result.push({
      type: "math",
      value: segment.value,
      display: segment.display,
      leading,
      trailing,
      bold: segment.bold,
    });
  }

  return result.filter((segment) => segment.type !== "text" || segment.value);
}

export function buildDocxInlineRuns(text, fontDocx) {
  const segments = attachMathDelimiters(prepareInlineSegments(text));
  let xml = "";

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.type === "math") {
      if (needSpaceBefore(segments, index)) {
        xml += '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
      }
      if (segment.leading) {
        xml += buildLtrTextRun(segment.leading, fontDocx, segment);
      }
      // m:oMath is a sibling of w:r inside w:p; wrapping it in w:r corrupts the file
      xml += latexToOMML(segment.value);
      if (segment.trailing) {
        xml += buildLtrTextRun(segment.trailing, fontDocx, segment);
      }
      if (needSpaceAfter(segments, index)) {
        xml += '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
      }
    } else if (segment.type === "code") {
      xml += buildCodeRun(segment.value, segment);
    } else if (segment.type === "text") {
      xml += buildTextRuns(segment.value, fontDocx, segment);
    }
  }

  return xml;
}
