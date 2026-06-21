import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import EditorToolbar from "./EditorToolbar";
import ImageLightbox from "./ImageLightbox";
import { prepareMarkdownForDisplay, prepareMarkdownForSave } from "../utils/markdownImages";
import { decorateNotebookDom } from "../utils/decorateNotebookDom";
import { markdownToHtml } from "../utils/markdownToHtml";
import { htmlToMarkdown } from "../utils/htmlToMarkdown";

function extractHeadingsFromEditor(container) {
  if (!container) return [];
  return [...container.querySelectorAll("h1, h2, h3")].map((element, index) => ({
    id: element.id || `heading-${index}`,
    level: Number(element.tagName.slice(1)),
    text: element.textContent?.trim() || "",
  }));
}

function assignHeadingIds(container) {
  if (!container) return;
  container.querySelectorAll("h1, h2, h3").forEach((element, index) => {
    element.id = `heading-${index}`;
  });
}

const VisualNotebookEditor = forwardRef(function VisualNotebookEditor(
  { content, lectureId, onDirtyChange, onHeadingsChange, focusMode = false },
  ref,
) {
  const editorRef = useRef(null);
  const initialHtmlRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState("");
  const [lightbox, setLightbox] = useState(null);

  function publishHeadings() {
    onHeadingsChange?.(extractHeadingsFromEditor(editorRef.current));
  }

  useEffect(() => {
    let cancelled = false;

    async function renderMarkdown() {
      setLoading(true);
      setRenderError("");
      try {
        const displayMarkdown = prepareMarkdownForDisplay(content, lectureId);
        const html = await markdownToHtml(displayMarkdown);
        if (cancelled || !editorRef.current) return;
        editorRef.current.innerHTML = html;
        assignHeadingIds(editorRef.current);
        decorateNotebookDom(editorRef.current);
        initialHtmlRef.current = html;
        onDirtyChange?.(false);
        publishHeadings();
      } catch (err) {
        if (!cancelled) {
          setRenderError(typeof err.message === "string" ? err.message : "טעינת המחברת נכשלה");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderMarkdown();
    return () => {
      cancelled = true;
    };
  }, [content, lectureId, onDirtyChange, onHeadingsChange]);

  useImperativeHandle(ref, () => ({
    getMarkdown() {
      if (!editorRef.current) return content;
      const markdown = htmlToMarkdown(editorRef.current.innerHTML);
      return prepareMarkdownForSave(markdown, lectureId);
    },
    scrollToHeading(headingId) {
      const element = editorRef.current?.querySelector(`#${headingId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    isDirty() {
      if (!editorRef.current) return false;
      return editorRef.current.innerHTML !== initialHtmlRef.current;
    },
    markSaved() {
      if (editorRef.current) {
        initialHtmlRef.current = editorRef.current.innerHTML;
      }
      onDirtyChange?.(false);
    },
    getEditorElement() {
      return editorRef.current;
    },
  }));

  function handleInput() {
    if (!editorRef.current) return;
    assignHeadingIds(editorRef.current);
    publishHeadings();
    onDirtyChange?.(editorRef.current.innerHTML !== initialHtmlRef.current);
  }

  function handleImageClick(event) {
    const image = event.target.closest("img.notebook-image");
    if (!image) return;
    setLightbox({ src: image.src, alt: image.alt });
  }

  return (
    <div
      className={`notebook-paper visual-editor flex min-h-0 flex-1 flex-col overflow-hidden ${
        focusMode ? "notebook-paper--focus" : ""
      }`}
    >
      {!focusMode && <EditorToolbar editorRef={editorRef} />}
      {loading && <p className="p-6 text-sm text-slate-500">טוען תוכן...</p>}
      {renderError && <p className="p-6 text-sm text-red-600">{renderError}</p>}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        className={`notebook-content notebook-wysiwyg flex-1 overflow-y-auto outline-none ${
          loading ? "hidden" : ""
        } ${focusMode ? "notebook-wysiwyg--focus" : ""}`}
        onInput={handleInput}
        onClick={handleImageClick}
      />
      <ImageLightbox
        src={lightbox?.src}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
});

export default VisualNotebookEditor;
