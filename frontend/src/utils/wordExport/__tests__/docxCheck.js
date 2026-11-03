// Checks a generated .docx for the OOXML mistakes that make Word refuse to open it.
// Returns a list of problems (empty list = looks valid).
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

// child order from the OOXML schema (only the parts we care about)
const PPR_ORDER = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr",
  "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap",
  "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
  "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc",
  "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr",
  "sectPr", "pPrChange",
];
const RPR_ORDER = [
  "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "outline",
  "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing",
  "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText",
  "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath",
];
const LVL_ORDER = [
  "start", "numFmt", "lvlRestart", "pStyle", "isLgl", "suff", "lvlText", "lvlPicBulletId",
  "legacy", "lvlJc", "pPr", "rPr",
];
// CT_Settings is long; this is the slice that matters for what we write
const SETTINGS_ORDER = [
  "writeProtection", "view", "zoom", "removePersonalInformation", "removeDateAndTime",
  "proofState", "attachedTemplate", "documentProtection", "defaultTabStop", "autoHyphenation",
  "evenAndOddHeaders", "characterSpacingControl", "updateFields", "footnotePr", "endnotePr",
  "compat", "docVars", "rsids", "mathPr", "attachedSchema", "themeFontLang", "clrSchemeMapping",
  "shapeDefaults", "decimalSymbol", "listSeparator",
];

function elements(node) {
  const out = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) out.push(child);
  }
  return out;
}

function allElements(doc, ns, name) {
  return Array.from(doc.getElementsByTagNameNS(ns, name));
}

function checkChildOrder(doc, partName, parentName, order, problems) {
  for (const parent of allElements(doc, W, parentName)) {
    let lastIndex = -1;
    let lastName = "";
    for (const child of elements(parent)) {
      const index = order.indexOf(child.localName);
      if (index === -1) {
        problems.push(`${partName}: unexpected <${child.nodeName}> inside <w:${parentName}>`);
        continue;
      }
      if (index < lastIndex) {
        problems.push(`${partName}: <${child.nodeName}> must come before <w:${lastName}> inside <w:${parentName}>`);
      }
      lastIndex = Math.max(lastIndex, index);
      if (index === lastIndex) lastName = child.localName;
    }
  }
}

function parseXml(text, partName, problems) {
  try {
    return new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") throw new Error(message);
      },
    }).parseFromString(text, "text/xml");
  } catch (error) {
    problems.push(`${partName}: XML does not parse — ${error.message}`);
    return null;
  }
}

export async function checkDocx(buffer) {
  const problems = [];
  const zip = await JSZip.loadAsync(buffer);
  const docs = {};

  // 1. every XML part parses
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || !/\.(xml|rels)$/.test(name)) continue;
    const doc = parseXml(await zip.file(name).async("string"), name, problems);
    if (doc) docs[name] = doc;
  }

  for (const [name, doc] of Object.entries(docs)) {
    // 2. every prefix listed in mc:Ignorable has to be declared
    for (const el of Array.from(doc.getElementsByTagName("*"))) {
      const ignorable = el.getAttributeNS(MC, "Ignorable");
      if (!ignorable) continue;
      for (const prefix of ignorable.split(/\s+/).filter(Boolean)) {
        if (!el.lookupNamespaceURI(prefix)) {
          problems.push(`${name}: mc:Ignorable lists "${prefix}" but xmlns:${prefix} is not declared`);
        }
      }
    }

    // 3. element order inside the containers Word is strict about
    checkChildOrder(doc, name, "pPr", PPR_ORDER, problems);
    checkChildOrder(doc, name, "rPr", RPR_ORDER, problems);
    checkChildOrder(doc, name, "lvl", LVL_ORDER, problems);
    checkChildOrder(doc, name, "settings", SETTINGS_ORDER, problems);
  }

  const documentXml = docs["word/document.xml"];
  if (!documentXml) {
    problems.push("word/document.xml is missing or broken");
    return problems;
  }

  // 4. math sits directly in the paragraph, never inside a run
  for (const math of allElements(documentXml, M, "oMath")) {
    const parent = math.parentNode;
    const okParent = (parent.namespaceURI === W && parent.localName === "p")
      || (parent.namespaceURI === M && parent.localName === "oMathPara");
    if (!okParent) problems.push(`document.xml: <m:oMath> inside <${parent.nodeName}>`);
  }
  for (const para of allElements(documentXml, M, "oMathPara")) {
    const parent = para.parentNode;
    if (!(parent.namespaceURI === W && parent.localName === "p")) {
      problems.push(`document.xml: <m:oMathPara> inside <${parent.nodeName}>`);
    }
  }

  // 5. images: unique relationship ids, every r:embed points to a real file
  const rels = docs["word/_rels/document.xml.rels"];
  const relTargets = new Map();
  if (rels) {
    for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      if (relTargets.has(id)) problems.push(`document.xml.rels: duplicate relationship id ${id}`);
      relTargets.set(id, rel.getAttribute("Target"));
    }
  }
  for (const blip of Array.from(documentXml.getElementsByTagName("a:blip"))) {
    const embed = blip.getAttributeNS(R, "embed");
    const target = relTargets.get(embed);
    if (!target) {
      problems.push(`document.xml: image points to unknown relationship ${embed}`);
    } else if (!zip.file(`word/${target}`)) {
      problems.push(`document.xml: image file word/${target} is missing`);
    }
  }
  const docPrIds = allElements(documentXml, WP, "docPr").map((el) => el.getAttribute("id"));
  if (new Set(docPrIds).size !== docPrIds.length) problems.push("document.xml: duplicate wp:docPr ids");

  // every media extension needs a content type
  const types = docs["[Content_Types].xml"];
  const knownExt = new Set(
    types ? Array.from(types.getElementsByTagName("Default")).map((el) => el.getAttribute("Extension")) : [],
  );
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("word/media/") || zip.files[name].dir) continue;
    const ext = name.split(".").pop();
    if (!knownExt.has(ext)) problems.push(`[Content_Types].xml: no content type for .${ext}`);
  }

  return problems;
}
