import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import EditorToolbar from "./EditorToolbar";
import { prepareMarkdownForDisplay, prepareMarkdownForSave } from "../utils/markdownImages";
import { markdownToHtml } from "../utils/markdownToHtml";
import { htmlToMarkdown } from "../utils/htmlToMarkdown";

const VisualNotebookEditor = forwardRef(function VisualNotebookEditor(
  { content, lectureId, onDirtyChange },
  ref,
) {
  const editorRef = useRef(null);
  const initialHtmlRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState("");

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
        initialHtmlRef.current = html;
        onDirtyChange?.(false);
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
  }, [content, lectureId, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    getMarkdown() {
      if (!editorRef.current) return content;
      const markdown = htmlToMarkdown(editorRef.current.innerHTML);
      return prepareMarkdownForSave(markdown, lectureId);
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
  }));

  function handleInput() {
    if (!editorRef.current) return;
    onDirtyChange?.(editorRef.current.innerHTML !== initialHtmlRef.current);
  }

  return (
    <div className="visual-editor flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <EditorToolbar editorRef={editorRef} />
      {loading && <p className="p-6 text-sm text-gray-500">טוען תוכן...</p>}
      {renderError && <p className="p-6 text-sm text-red-600">{renderError}</p>}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        className={`notebook-content notebook-wysiwyg min-h-[60vh] flex-1 overflow-y-auto p-6 outline-none ${
          loading ? "hidden" : ""
        }`}
        onInput={handleInput}
      />
    </div>
  );
});

export default VisualNotebookEditor;
