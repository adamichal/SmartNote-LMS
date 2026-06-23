import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { exportNotebook, getNotebook, openNotebookPrintView, saveNotebook } from "../api/client";
import NotebookToc from "../components/NotebookToc";
import VisualNotebookEditor from "../components/VisualNotebookEditor";
import { estimateReadingMinutes, extractHeadings } from "../utils/notebookMeta";
import { copyNotebookToWord, downloadNotebookDocx } from "../utils/wordExport";
import "katex/dist/katex.min.css";

export default function NotebookEditor() {
  const { courseName, lectureId } = useParams();
  const decodedCourse = decodeURIComponent(courseName);
  const decodedLecture = decodeURIComponent(lectureId);
  const editorRef = useRef(null);

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [headings, setHeadings] = useState([]);
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [copyingToWord, setCopyingToWord] = useState(false);
  const readingMinutes = useMemo(() => estimateReadingMinutes(content), [content]);

  const refreshToc = useCallback((nextHeadings) => {
    setHeadings(nextHeadings ?? []);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getNotebook(decodedLecture);
        setContent(data.content);
        setHeadings(extractHeadings(data.content));
        setIsDirty(false);
      } catch (err) {
        setLoadError(typeof err.message === "string" ? err.message : "טעינת המחברת נכשלה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [decodedLecture]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage("");
    setActionError("");
    try {
      const markdown = editorRef.current?.getMarkdown() ?? content;
      await saveNotebook(decodedLecture, markdown);
      setContent(markdown);
      editorRef.current?.markSaved();
      setIsDirty(false);
      setMessage("המחברת נשמרה");
    } catch (err) {
      setActionError(typeof err.message === "string" ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }, [content, decodedLecture]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) handleSave();
      }
      if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, saving, focusMode]);

  useEffect(() => {
    const root = editorRef.current?.getEditorElement?.();
    if (!root || !headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveHeadingId(visible[0].target.id);
        }
      },
      { root, rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );

    headings.forEach((heading) => {
      const element = root.querySelector(`#${CSS.escape(heading.id)}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings, loading, content]);

  async function handleCopyToWord() {
    setCopyingToWord(true);
    setMessage("");
    setActionError("");
    try {
      const markdown = editorRef.current?.getMarkdown() ?? content;
      await copyNotebookToWord(markdown, decodedLecture);
      setMessage("הועתק ללוח — הדביקי ב-Word עם Ctrl+V (תמונות מוצגות כתיאור טקסט; לשקפים מלאים השתמשי ב'ייצוא PDF')");
    } catch (err) {
      setActionError(typeof err.message === "string" ? err.message : "העתקה ל-Word נכשלה");
    } finally {
      setCopyingToWord(false);
    }
  }

  async function handleExport(format) {
    if (format !== "docx" && isDirty) {
      setActionError("יש לשמור את המחברת לפני ייצוא");
      return;
    }

    if (format === "pdf") {
      setMessage("");
      setActionError("");
      openNotebookPrintView(decodedLecture);
      setMessage('נפתח חלון הדפסה — בחר "שמור כ-PDF" / Microsoft Print to PDF');
      return;
    }

    if (format === "docx") {
      setExporting(format);
      setMessage("");
      setActionError("");
      try {
        const markdown = editorRef.current?.getMarkdown() ?? content;
        const filename = `${decodedLecture.replace(/[^\w\u0590-\u05FF.-]+/g, "_")}_notebook.docx`;
        await downloadNotebookDocx(markdown, filename, decodedLecture);
        setMessage("קובץ Word הורד בהצלחה (עברית RTL + נוסחאות)");
      } catch (err) {
        setActionError(typeof err.message === "string" ? err.message : "ייצוא Word נכשל");
      } finally {
        setExporting("");
      }
      return;
    }

    setExporting(format);
    setMessage("");
    setActionError("");
    try {
      await exportNotebook(decodedLecture, format);
      setMessage(`הקובץ יוצא בפורמט ${format.toUpperCase()}`);
    } catch (err) {
      setActionError(typeof err.message === "string" ? err.message : "ייצוא נכשל");
    } finally {
      setExporting("");
    }
  }

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to={`/courses/${encodeURIComponent(decodedCourse)}`}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            ← {decodedCourse}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">מחברת לימוד</h1>
          <p className="mt-1 text-sm text-slate-500">
            {decodedLecture.replace(/_/g, " ")} · כ-{readingMinutes} דקות קריאה
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFocusMode((value) => !value)}
            className={`btn-secondary ${focusMode ? "ring-2 ring-indigo-300" : ""}`}
            title="הסתר סרגל כלים ותוכן עניינים לקריאה נוחה"
          >
            {focusMode ? "יציאה ממצב קריאה" : "מצב קריאה"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="btn-primary"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
          <button
            type="button"
            onClick={handleCopyToWord}
            disabled={copyingToWord || loading}
            className="btn-secondary"
            title="מעתיק עם נוסחאות MathML להדבקה ישירה ב-Word"
          >
            {copyingToWord ? "מעתיק..." : "העתק ל-Word"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={Boolean(exporting) || isDirty}
            className="btn-secondary"
          >
            ייצוא PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport("docx")}
            disabled={Boolean(exporting) || loading}
            className="btn-secondary"
            title="ייצוא Word עם עברית RTL ונוסחאות — ללא Pandoc"
          >
            {exporting === "docx" ? "מייצא..." : "הורד Word"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("md")}
            disabled={Boolean(exporting) || isDirty}
            className="btn-secondary"
          >
            {exporting === "md" ? "מייצא..." : "MD"}
          </button>
        </div>
      </div>

      {loading && <p className="text-slate-500">טוען מחברת...</p>}
      {loadError && <p className="flash-message flash-message--error mb-4">{loadError}</p>}
      {actionError && <p className="flash-message flash-message--error mb-4">{actionError}</p>}
      {message && <p className="flash-message flash-message--success mb-4">{message}</p>}
      {isDirty && !loading && (
        <p className="flash-message flash-message--warning mb-4">
          יש שינויים שלא נשמרו · Ctrl+S לשמירה
        </p>
      )}

      {!loading && !loadError && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          {!focusMode && (
            <NotebookToc
              headings={headings}
              activeId={activeHeadingId}
              onSelect={(headingId) => editorRef.current?.scrollToHeading(headingId)}
            />
          )}
          <div className="notebook-canvas min-h-0 flex-1 overflow-auto rounded-xl p-2 sm:p-4">
            <VisualNotebookEditor
              ref={editorRef}
              content={content}
              lectureId={decodedLecture}
              onDirtyChange={setIsDirty}
              onHeadingsChange={refreshToc}
              focusMode={focusMode}
            />
          </div>
        </div>
      )}
    </div>
  );
}
