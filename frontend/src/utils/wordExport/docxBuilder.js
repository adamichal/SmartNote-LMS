import JSZip from "jszip";
import { escapeXml, fixRtlBrackets } from "./helpers";
import { latexToOMML } from "./latexOmml";
import {
  needSpaceAfter,
  needSpaceBefore,
  prepareInlineSegments,
} from "./inlineSegments";

function buildInlineRuns(text, imageResolver) {
  const segments = prepareInlineSegments(text);
  let xml = "";

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment.type === "math") {
      if (needSpaceBefore(segments, index)) {
        xml += '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
      }
      xml += latexToOMML(segment.value);
      if (needSpaceAfter(segments, index)) {
        xml += '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
      }
    } else if (segment.type === "code") {
      const runProps = [
        '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>',
      ];
      if (segment.bold) runProps.push("<w:b/><w:bCs/>");
      xml += `<w:r><w:rPr>${runProps.join("")}</w:rPr><w:t xml:space="preserve">${escapeXml(segment.value)}</w:t></w:r>`;
    } else if (segment.type === "text") {
      if (segment.value.length > 0) {
        const hasHebrew = /[\u0590-\u05FF]/.test(segment.value);
        const fixed = hasHebrew ? fixRtlBrackets(segment.value) : segment.value;
        const runProps = [];
        if (segment.bold) runProps.push("<w:b/><w:bCs/>");
        if (hasHebrew) runProps.push("<w:rtl/>");
        const runPropsXml = runProps.length > 0 ? `<w:rPr>${runProps.join("")}</w:rPr>` : "";
        xml += `<w:r>${runPropsXml}<w:t xml:space="preserve">${escapeXml(fixed)}</w:t></w:r>`;
      }
    }
  }

  return xml;
}

function buildParagraph(content, style, numPr, imageResolver) {
  let paragraphProps = "<w:pPr>";
  if (style) paragraphProps += `<w:pStyle w:val="${style}"/>`;
  if (numPr) paragraphProps += numPr;
  paragraphProps += "<w:bidi/><w:jc w:val=\"right\"/></w:pPr>";
  return `<w:p>${paragraphProps}${buildInlineRuns(content, imageResolver)}</w:p>`;
}

function buildBlockquote(content, imageResolver) {
  const paragraphProps =
    '<w:pPr><w:bidi/><w:jc w:val="right"/><w:ind w:right="360"/><w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/></w:pPr>';
  return `<w:p>${paragraphProps}${buildInlineRuns(content, imageResolver)}</w:p>`;
}

function buildDocxTable(block, imageResolver) {
  const numCols = block.header.length;
  const colWidth = Math.floor(9026 / numCols);
  const border = '<w:val w:val="single" w:sz="4" w:space="0" w:color="999999"/>';
  const borders = `<w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders>`;

  let xml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:bidiVisual/><w:tblW w:w="9026" w:type="dxa"/>${borders}<w:tblLook w:val="04A0"/></w:tblPr>`;
  xml += `<w:tblGrid>${`<w:gridCol w:w="${colWidth}"/>`.repeat(numCols)}</w:tblGrid>`;

  xml += "<w:tr>";
  for (const cell of block.header) {
    xml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/></w:tcPr>`;
    xml += `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>${buildInlineRuns(cell.replace(/\*+/g, ""), imageResolver)}</w:p></w:tc>`;
  }
  xml += "</w:tr>";

  for (const row of block.rows) {
    xml += "<w:tr>";
    for (let column = 0; column < numCols; column += 1) {
      xml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr>`;
      xml += `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>${buildInlineRuns(row[column] || "", imageResolver)}</w:p></w:tc>`;
    }
    xml += "</w:tr>";
  }

  xml += "</w:tbl>";
  return xml;
}

function generateDocumentXml(blocks, imageResolver) {
  let body = "";
  const olBlocks = [];
  let listCounter = 0;

  for (const block of blocks) {
    if (block.type === "h1") {
      body += buildParagraph(block.content, "Heading1", null, imageResolver);
    } else if (block.type === "h2") {
      body += buildParagraph(block.content, "Heading2", null, imageResolver);
    } else if (block.type === "h3") {
      body += buildParagraph(block.content, "Heading3", null, imageResolver);
    } else if (block.type === "h4") {
      body += buildParagraph(block.content, "Heading4", null, imageResolver);
    } else if (block.type === "p") {
      body += buildParagraph(block.content, null, null, imageResolver);
    } else if (block.type === "blockquote") {
      body += buildBlockquote(block.content, imageResolver);
    } else if (block.type === "hr") {
      body += '<w:p><w:pPr><w:bidi/><w:jc w:val="right"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>';
    } else if (block.type === "image") {
      const alt = block.alt || "תמונה";
      body += buildParagraph(`[תמונה: ${alt}]`, null, null, imageResolver);
    } else if (block.type === "table") {
      body += buildDocxTable(block, imageResolver);
    } else if (block.type === "ul") {
      for (const item of block.items) {
        const level = item.indent || 0;
        const numPr = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr>`;
        body += buildParagraph(item.content, "ListParagraph", numPr, imageResolver);
      }
    } else if (block.type === "ol") {
      listCounter += 1;
      const numId = listCounter + 2;
      for (const item of block.items) {
        const numPr = `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`;
        body += buildParagraph(item.content, "ListParagraph", numPr, imageResolver);
      }
      olBlocks.push({ numId, start: block.start || 1 });
    }
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
  return { xml: docXml, olBlocks };
}

function generateStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David" w:eastAsia="David"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="en-US" w:bidi="he-IL"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="right"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:rtl/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="right"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:color w:val="2E4057"/><w:rtl/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="right"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:rtl/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:jc w:val="right"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:rtl/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:ind w:left="720"/><w:jc w:val="right"/></w:pPr></w:style>
</w:styles>`;
}

function generateNumberingXml(olBlocks) {
  let numInstances = '  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>\n';
  if (!olBlocks?.length) {
    numInstances += '  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>\n';
  } else {
    for (const ordered of olBlocks) {
      numInstances += `  <w:num w:numId="${ordered.numId}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${ordered.start}"/></w:lvlOverride></w:num>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="right"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val=".%1"/><w:lvlJc w:val="right"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
${numInstances}</w:numbering>`;
}

function generateSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:themeFontLang w:val="en-US" w:bidi="he-IL"/>
  <m:mathPr><m:mathFont m:val="Cambria Math"/></m:mathPr>
</w:settings>`;
}

function generateContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
}

function generateRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function generateWordRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;
}

export async function buildDocxBlob(blocks) {
  const zip = new JSZip();
  const documentResult = generateDocumentXml(blocks);

  zip.file("[Content_Types].xml", generateContentTypesXml());
  zip.file("_rels/.rels", generateRelsXml());
  zip.file("word/_rels/document.xml.rels", generateWordRelsXml());
  zip.file("word/document.xml", documentResult.xml);
  zip.file("word/styles.xml", generateStylesXml());
  zip.file("word/settings.xml", generateSettingsXml());
  zip.file("word/numbering.xml", generateNumberingXml(documentResult.olBlocks));

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
