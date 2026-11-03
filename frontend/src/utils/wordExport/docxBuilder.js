import JSZip from "jszip";
import { resolveWordFont } from "./config";
import { expandCalloutSections, pxToEmu, scaleImageDimensions } from "./helpers";
import { buildDocxInlineRuns } from "./docxInline";
import { latexToOMML } from "./latexOmml";
import {
  BODY_PARAGRAPH_SPACING_AFTER,
  BLOCK_GAP_SPACING,
  generateNumberingXml,
  generateSettingsXml,
  generateStylesXml,
  generateCorePropsXml,
  generateAppPropsXml,
  generateFontTableXml,
  generatePackageRelsXml,
} from "./notebookLmDocx";

const HEADING_STYLES = new Set(["Heading1", "Heading2", "Heading3", "Heading4"]);
const GAP_AFTER_TYPES = new Set(["h1", "h2", "h3", "h4", "p", "blockquote", "ul", "ol", "table", "hr", "image"]);

function paragraphSpacingXml(style, numPr) {
  if (style && HEADING_STYLES.has(style)) {
    return "";
  }
  if (!style || numPr) {
    return `<w:spacing w:after="${BODY_PARAGRAPH_SPACING_AFTER}"/>`;
  }
  return "";
}

// a line that is only "$$...$$" becomes its own display-math paragraph
const DISPLAY_MATH_LINE = /^\$\$([^$]+)\$\$$/;

function buildDisplayMathParagraph(latex) {
  return `<w:p><w:pPr><w:spacing w:after="${BODY_PARAGRAPH_SPACING_AFTER}"/><w:jc w:val="center"/></w:pPr><m:oMathPara>${latexToOMML(latex)}</m:oMathPara></w:p>`;
}

function buildParagraph(content, style, numPr, fontDocx) {
  const displayMath = !style && !numPr && content.trim().match(DISPLAY_MATH_LINE);
  if (displayMath) return buildDisplayMathParagraph(displayMath[1]);

  // pPr children must follow schema order: pStyle, numPr, ..., bidi, spacing, ..., jc
  let paragraphProps = "<w:pPr>";
  if (style) paragraphProps += `<w:pStyle w:val="${style}"/>`;
  if (numPr) paragraphProps += numPr;
  paragraphProps += "<w:bidi/>";
  const spacing = paragraphSpacingXml(style, numPr);
  if (spacing) paragraphProps += spacing;
  paragraphProps += '<w:jc w:val="right"/></w:pPr>';
  const runs = buildDocxInlineRuns(content, fontDocx);
  if (!runs.trim()) {
    return `<w:p>${paragraphProps}</w:p>`;
  }
  return `<w:p>${paragraphProps}${runs}</w:p>`;
}

function buildGapParagraph() {
  return `<w:p><w:pPr><w:bidi/><w:spacing w:after="${BLOCK_GAP_SPACING}"/></w:pPr></w:p>`;
}

function buildBlockquote(content, fontDocx) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return buildParagraph(content, null, null, fontDocx);
  return lines.map((line) => buildParagraph(line, null, null, fontDocx)).join("");
}

function buildImageDrawing(relId, widthPx, heightPx, docPrId) {
  const widthEmu = pxToEmu(widthPx);
  const heightEmu = pxToEmu(heightPx);
  return `<w:p><w:pPr><w:bidi/><w:spacing w:after="${BODY_PARAGRAPH_SPACING_AFTER}"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="${docPrId}" name="Picture ${docPrId}"/>
      <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Image ${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`;
}

function buildDocxTable(block, fontDocx) {
  const numCols = block.header.length;
  const colWidth = Math.floor(9026 / numCols);
  const border = 'w:val="single" w:sz="4" w:space="0" w:color="999999"';
  const borders = `<w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders>`;

  let xml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:bidiVisual/><w:tblW w:w="9026" w:type="dxa"/>${borders}<w:tblLook w:val="04A0"/></w:tblPr>`;
  xml += `<w:tblGrid>${`<w:gridCol w:w="${colWidth}"/>`.repeat(numCols)}</w:tblGrid>`;

  xml += "<w:tr>";
  for (const cell of block.header) {
    xml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr>`;
    xml += `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>${buildDocxInlineRuns(cell.replace(/\*+/g, ""), fontDocx)}</w:p></w:tc>`;
  }
  xml += "</w:tr>";

  for (const row of block.rows) {
    xml += "<w:tr>";
    for (let column = 0; column < numCols; column += 1) {
      xml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr>`;
      xml += `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>${buildDocxInlineRuns(row[column] || "", fontDocx)}</w:p></w:tc>`;
    }
    xml += "</w:tr>";
  }

  xml += "</w:tbl>";
  xml += `<w:p><w:pPr><w:bidi/><w:spacing w:after="${BODY_PARAGRAPH_SPACING_AFTER}"/></w:pPr></w:p>`;
  return xml;
}

function extensionForMime(mime) {
  if (mime === "image/jpeg") return "jpeg";
  return "png";
}

function appendBlockXml(block, fontDocx, imageRelMap, state) {
  let body = "";

  if (block.type === "h1") {
    body += buildParagraph(block.content, "Heading1", null, fontDocx);
  } else if (block.type === "h2") {
    body += buildParagraph(block.content, "Heading2", null, fontDocx);
  } else if (block.type === "h3") {
    body += buildParagraph(block.content, "Heading3", null, fontDocx);
  } else if (block.type === "h4") {
    body += buildParagraph(block.content, "Heading4", null, fontDocx);
  } else if (block.type === "p") {
    body += buildParagraph(block.content, null, null, fontDocx);
  } else if (block.type === "blockquote") {
    body += buildBlockquote(block.content, fontDocx);
  } else if (block.type === "hr") {
    body += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr><w:bidi/><w:spacing w:after="${BODY_PARAGRAPH_SPACING_AFTER}"/><w:jc w:val="right"/></w:pPr></w:p>`;
  } else if (block.type === "image") {
    const rel = imageRelMap.get(block);
    if (rel) {
      const scaled = scaleImageDimensions(block.width, block.height);
      body += buildImageDrawing(rel.id, scaled.width, scaled.height, rel.docPrId);
    } else {
      const alt = block.alt || "תמונה";
      body += buildParagraph(`[תמונה: ${alt}]`, null, null, fontDocx);
    }
  } else if (block.type === "table") {
    body += buildDocxTable(block, fontDocx);
  } else if (block.type === "ul") {
    for (const item of block.items) {
      const content = item.content?.trim();
      if (!content) continue;
      const level = Math.min(item.indent || 0, 2);
      const numPr = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr>`;
      body += buildParagraph(content, "ListParagraph", numPr, fontDocx);
    }
  } else if (block.type === "ol") {
    state.listCounter += 1;
    const numId = state.listCounter + 2;
    for (const item of block.items) {
      const content = item.content?.trim();
      if (!content) continue;
      const level = Math.min(item.indent || 0, 2);
      const numPr = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`;
      body += buildParagraph(content, "ListParagraph", numPr, fontDocx);
    }
    state.olBlocks.push({ numId, start: block.start || 1 });
  } else if (block.type === "callout") {
    for (const child of block.blocks) {
      body += appendBlockXml(child, fontDocx, imageRelMap, state);
    }
  }

  if (GAP_AFTER_TYPES.has(block.type)) {
    body += buildGapParagraph();
  }

  return body;
}

function generateDocumentXml(blocks, fontDocx, imageRelMap) {
  const expanded = expandCalloutSections(blocks);
  const state = { listCounter: 0, olBlocks: [] };
  let body = "";

  for (const block of expanded) {
    body += appendBlockXml(block, fontDocx, imageRelMap, state);
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14">
  <w:body>
${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:bidi/>
      <w:rtlGutter/>
    </w:sectPr>
  </w:body>
</w:document>`;
  return { xml: docXml, olBlocks: state.olBlocks };
}

function generateContentTypesXml(imageExtensions) {
  const imageDefaults = [...new Set(imageExtensions)]
    .map((ext) => `  <Default Extension="${ext}" ContentType="image/${ext === "jpg" ? "jpeg" : ext}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${imageDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function generateWordRelsXml(imageRels) {
  const staticRels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>',
  ];
  const dynamicRels = imageRels.map(
    (rel) =>
      `<Relationship Id="${rel.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${rel.filename}"/>`,
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${[...staticRels, ...dynamicRels].join("\n  ")}
</Relationships>`;
}

export async function buildDocxBlob(blocks, { fontId = "assistant", includeImages = true } = {}) {
  const font = resolveWordFont(fontId);
  const zip = new JSZip();
  const imageRelMap = new Map();
  const imageRels = [];
  const imageExtensions = [];
  let imageCounter = 0;
  let docPrCounter = 0;

  if (includeImages) {
    for (const block of blocks) {
      if (block.type !== "image" || !block.bytes) continue;
      imageCounter += 1;
      docPrCounter += 1;
      const ext = extensionForMime(block.mime || "image/png");
      const relId = `rId${imageCounter + 4}`;
      const filename = `image${imageCounter}.${ext}`;
      imageRels.push({ id: relId, filename });
      imageRelMap.set(block, { id: relId, filename, docPrId: docPrCounter });
      imageExtensions.push(ext);
      zip.file(`word/media/${filename}`, block.bytes);
    }
  }

  const documentResult = generateDocumentXml(blocks, font.docx, imageRelMap);

  zip.file("[Content_Types].xml", generateContentTypesXml(imageExtensions));
  zip.file("_rels/.rels", generatePackageRelsXml());
  zip.file("docProps/core.xml", generateCorePropsXml());
  zip.file("docProps/app.xml", generateAppPropsXml());
  zip.file("word/_rels/document.xml.rels", generateWordRelsXml(imageRels));
  zip.file("word/document.xml", documentResult.xml);
  zip.file("word/styles.xml", generateStylesXml(font.docx));
  zip.file("word/settings.xml", generateSettingsXml());
  zip.file("word/numbering.xml", generateNumberingXml(documentResult.olBlocks));
  zip.file("word/fontTable.xml", generateFontTableXml(font.docx));

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
