import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { prepareMarkdownForDisplay } from "../../markdownImages";
import { buildDocxBlob } from "../docxBuilder";
import { normalizeMarkdownForWordExport } from "../normalizeMarkdown";
import { parseNotebookMarkdown } from "../parseMarkdown";
import { checkDocx } from "./docxCheck";

const here = dirname(fileURLToPath(import.meta.url));

// same steps as prepareBlocks() in index.js, minus fetching images from the server
function markdownToBlocks(markdown) {
  return parseNotebookMarkdown(
    normalizeMarkdownForWordExport(prepareMarkdownForDisplay(markdown, "course", "lecture")),
  );
}

async function buildDocx(blocks, options) {
  const blob = await buildDocxBlob(blocks, options);
  return Buffer.from(await blob.arrayBuffer());
}

describe("Word export", () => {
  it("builds a valid docx from the sample notebook", async () => {
    const markdown = readFileSync(join(here, "fixture.md"), "utf-8");
    const buffer = await buildDocx(markdownToBlocks(markdown), { includeImages: false });
    expect(await checkDocx(buffer)).toEqual([]);

    // make sure the fixture really produced math, otherwise the checks above prove nothing
    const documentXml = await (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");
    expect(documentXml).toContain("<m:oMathPara>");
    expect((documentXml.match(/<m:oMath>/g) || []).length).toBeGreaterThan(5);
  });

  it("keeps image relationships valid", async () => {
    // tiny fake image bytes are enough, Word only needs the parts to line up
    const blocks = markdownToBlocks("# כותרת\n\nטקסט\n\n![a](./extracted_images/page_001.png)\n\n![b](./extracted_images/page_002.png)");
    for (const block of blocks) {
      if (block.type === "image") Object.assign(block, { bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg", width: 800, height: 600 });
    }
    const buffer = await buildDocx(blocks, { includeImages: true });
    expect(await checkDocx(buffer)).toEqual([]);
  });

  // Optional check on a real notebook from disk (never committed):
  //   SMARTNOTE_DOCX_CHECK=<path to final_notebook.md> [SMARTNOTE_DOCX_OUT=<out.docx>] npm test
  const realNotebook = process.env.SMARTNOTE_DOCX_CHECK;
  it.skipIf(!realNotebook)("builds a valid docx from a real notebook (with images)", async () => {
    const markdown = readFileSync(realNotebook, "utf-8");
    const imagesDir = join(dirname(realNotebook), "extracted_images");
    const blocks = markdownToBlocks(markdown);
    for (const block of blocks) {
      if (block.type !== "image") continue;
      try {
        const bytes = readFileSync(join(imagesDir, decodeURIComponent(basename(block.src))));
        // PNG width/height live at bytes 16-23 of the header
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        Object.assign(block, { bytes, mime: "image/png", width: view.getUint32(16), height: view.getUint32(20) });
      } catch {
        // missing image -> the builder writes a text placeholder, same as in the app
      }
    }
    const buffer = await buildDocx(blocks, { includeImages: true });
    if (process.env.SMARTNOTE_DOCX_OUT) writeFileSync(process.env.SMARTNOTE_DOCX_OUT, buffer);
    expect(await checkDocx(buffer)).toEqual([]);
  });
});
