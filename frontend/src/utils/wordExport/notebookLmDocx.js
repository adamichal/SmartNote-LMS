import { resolveWordFont } from "./config";
import { escapeXml } from "./helpers";

/** 14pt spacing after body paragraphs (twips). */
export const BODY_PARAGRAPH_SPACING_AFTER = 280;
/** Extra blank line between blocks (twips). */
export const BLOCK_GAP_SPACING = 200;

function generateStylesXml(fontDocx) {
  const font = escapeXml(fontDocx);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="en-US" w:bidi="he-IL"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:bidi/>
        <w:spacing w:after="280" w:line="288" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepLines/><w:bidi/>
      <w:spacing w:before="360" w:after="200"/>
      <w:jc w:val="right"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
      <w:b/><w:bCs/><w:color w:val="1E3A5F"/><w:sz w:val="32"/><w:szCs w:val="32"/>
      <w:rtl/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepLines/><w:bidi/>
      <w:spacing w:before="280" w:after="160"/>
      <w:jc w:val="right"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
      <w:b/><w:bCs/><w:color w:val="2A4A6F"/><w:sz w:val="28"/><w:szCs w:val="28"/>
      <w:rtl/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:bidi/>
      <w:spacing w:before="240" w:after="120"/>
      <w:jc w:val="right"/>
      <w:outlineLvl w:val="2"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
      <w:b/><w:bCs/><w:color w:val="365A85"/><w:sz w:val="26"/><w:szCs w:val="26"/>
      <w:rtl/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:bidi/>
      <w:spacing w:before="200" w:after="80"/>
      <w:jc w:val="right"/>
      <w:outlineLvl w:val="3"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
      <w:b/><w:bCs/><w:color w:val="4A7FAD"/><w:sz w:val="24"/><w:szCs w:val="24"/>
      <w:rtl/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:bidi/>
      <w:spacing w:after="280"/>
      <w:ind w:left="720"/>
      <w:jc w:val="right"/>
    </w:pPr>
  </w:style>
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
    <w:nsid w:val="0A991001"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/><w:numFmt w:val="bullet"/><w:suff w:val="tab"/><w:lvlText w:val="•"/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:bidi/><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/><w:rtl/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/><w:numFmt w:val="bullet"/><w:suff w:val="tab"/><w:lvlText w:val="◦"/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:bidi/><w:ind w:left="1440" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:hint="default"/><w:rtl/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/><w:numFmt w:val="bullet"/><w:suff w:val="tab"/><w:lvlText w:val="▪"/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:bidi/><w:ind w:left="2160" w:hanging="360"/></w:pPr>
      <w:rPr><w:rtl/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:nsid w:val="0A991002"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/><w:numFmt w:val="decimal"/><w:suff w:val="tab"/><w:lvlText w:val="%1."/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:bidi/><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rtl/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:suff w:val="tab"/><w:lvlText w:val="%2."/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:bidi/><w:ind w:left="1440" w:hanging="360"/></w:pPr>
      <w:rPr><w:rtl/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:suff w:val="tab"/><w:lvlText w:val="%3."/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:bidi/><w:ind w:left="2160" w:hanging="360"/></w:pPr>
      <w:rPr><w:rtl/></w:rPr>
    </w:lvl>
  </w:abstractNum>
${numInstances}</w:numbering>`;
}

function generateSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:o="urn:schemas-microsoft-com:office:office">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
  <m:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
    <m:lMargin m:val="0"/>
    <m:rMargin m:val="0"/>
  </m:mathPr>
  <w:themeFontLang w:val="en-US" w:bidi="he-IL"/>
</w:settings>`;
}

function generateCorePropsXml() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SmartNote Notebook</dc:title>
  <dc:creator>SmartNote</dc:creator>
  <cp:lastModifiedBy>SmartNote</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function generateAppPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SmartNote</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>SmartNote</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>`;
}

function generateFontTableXml(fontDocx) {
  const font = escapeXml(fontDocx);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:font w:name="${font}">
    <w:panose1 w:val="020B0604020202020204"/>
    <w:charset w:val="AA"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
    <w:sig w:usb0="E0002AFF" w:usb1="C0007841" w:usb2="00000009" w:usb3="00000000" w:csb0="000001FF" w:csb1="00000000"/>
  </w:font>
  <w:font w:name="Courier New">
    <w:panose1 w:val="02070309020205020404"/>
    <w:charset w:val="00"/>
    <w:family w:val="modern"/>
    <w:pitch w:val="fixed"/>
  </w:font>
  <w:font w:name="Cambria Math">
    <w:panose1 w:val="02040503050406030204"/>
    <w:charset w:val="00"/>
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
  </w:font>
</w:fonts>`;
}

function generatePackageRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

export {
  generateStylesXml,
  generateNumberingXml,
  generateSettingsXml,
  generateCorePropsXml,
  generateAppPropsXml,
  generateFontTableXml,
  generatePackageRelsXml,
};
