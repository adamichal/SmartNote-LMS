import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  exportNotebook,
  generateExamSummary,
  getExamSummary,
  getNotebook,
  saveNotebook,
} from "../api/client";
import MarkdownPreview from "../components/MarkdownPreview";
import NotebookToc from "../components/NotebookToc";
import VisualNotebookEditor from "../components/VisualNotebookEditor";
import { estimateReadingMinutes, extractHeadings } from "../utils/notebookMeta";
import { copyNotebookToWord, downloadNotebookDocx, getWordExportFont, setWordExportFont, WORD_FONTS } from "../utils/wordExport";
import "katex/dist/katex.min.css";

export default function NotebookEditor() {
  const { courseName, lectureId } = useParams();
  const decodedCourse = decodeURIComponent(courseName);
  const decodedLecture = decodeURIComponent(lectureId);
  const editorRef = useRef(null);

  const [viewMode, setViewMode] = useState("notebook");
  const [content, setContent] = useState("");
  const [summaryContent, setSummaryContent] = useState("");
  const [summaryAvailable, setSummaryAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
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
  const [wordFontId, setWordFontId] = useState(() => getWordExportFont());
  const [wordIncludeImages, setWordIncludeImages] = useState(true);
  const readingMinutes = useMemo(() => estimateReadingMinutes(content), [content]);
  const summaryReadingMinutes = useMemo(
    () => estimateReadingMinutes(summaryContent),
    [summaryContent],
  );

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await getExamSummary(decodedCourse, decodedLecture);
      setSummaryContent(data.content);
      setSummaryAvailable(true);
    } catch {
      setSummaryContent("");
      setSummaryAvailable(false);
    } finally {
      setSummaryLoading(false);
    }
  }, [decodedCourse, decodedLecture]);

  const refreshToc = useCallback((nextHeadings) => {
    setHeadings(nextHeadings ?? []);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getNotebook(decodedCourse, decodedLecture);
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
  }, [decodedCourse, decodedLecture]);

  useEffect(() => {
    if (viewMode === "summary") {
      loadSummary();
    }
  }, [viewMode, loadSummary]);

  const handleGenerateSummary = useCallback(async () => {
    setGeneratingSummary(true);
    setMessage("");
    setActionError("");
    try {
      if (isDirty) {
        const markdown = editorRef.current?.getMarkdown() ?? content;
        await saveNotebook(decodedCourse, decodedLecture, markdown);
        setContent(markdown);
        editorRef.current?.markSaved();
        setIsDirty(false);
      }
      const data = await generateExamSummary(decodedCourse, decodedLecture);
      setSummaryContent(data.content);
      setSummaryAvailable(true);
      setMessage("סיכום למבחן נוצר בהצלחה");
    } catch (err) {
      setActionError(typeof err.message === "string" ? err.message : "יצירת סיכום נכשלה");
    } finally {
      setGeneratingSummary(false);
    }
  }, [content, decodedCourse, decodedLecture, isDirty]);

  function handleDownloadSummaryMd() {
    if (!summaryContent) return;
    const blob = new Blob([summaryContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${decodedLecture.replace(/[^\w\u0590-\u05FF.-]+/g, "_")}_exam_summary.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage("");
    setActionError("");
    try {
      const markdown = editorRef.current?.getMarkdown() ?? content;
      await saveNotebook(decodedCourse, decodedLecture, markdown);
      setContent(markdown);
      editorRef.current?.markSaved();
      setIsDirty(false);
      setMessage("המחברת נשמרה");
    } catch (err) {
      setActionError(typeof err.message === "string" ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }, [content, decodedCourse, decodedLecture]);

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
      await copyNotebookToWord(markdown, decodedCourse, decodedLecture, {
        fontId: wordFontId,
        includeImages: wordIncludeImages,
      });
      setMessage(
        wordIncludeImages
          ? "הועתק ללוח עם תמונות — הדביקי ב-Word עם Ctrl+V"
          : "הועתק ללוח — הדביקי ב-Word עם Ctrl+V (תמונות מוצגות כתיאור טקסט)",
      );
    } catch (err) {
      setActionError(typeof err.message === "string" ? err.message : "העתקה ל-Word נכשלה");
    } finally {
      setCopyingToWord(false);
    }
  }

  function handleWordFontChange(event) {
    const nextFont = event.target.value;
    setWordFontId(nextFont);
    setWordExportFont(nextFont);
  }

  async function handleExport(format) {
    if (format !== "docx" && isDirty) {
      setActionError("יש לשמור את המחברת לפני ייצוא");
      return;
    }

    if (format === "pdf") {
      setExporting(format);
      setMessage("");
      setActionError("");
      try {
        await exportNotebook(decodedCourse, decodedLecture, format);
        setMessage("קובץ PDF הורד בהצלחה");
      } catch (err) {
        setActionError(typeof err.message === "string" ? err.message : "ייצוא PDF נכשל");
      } finally {
        setExporting("");
      }
      return;
    }

    if (format === "docx") {
      setExporting(format);
      setMessage("");
      setActionError("");
      try {
        const markdown = editorRef.current?.getMarkdown() ?? content;
        const filename = `${decodedLecture.replace(/[^\w\u0590-\u05FF.-]+/g, "_")}_notebook.docx`;
        await downloadNotebookDocx(markdown, filename, decodedCourse, decodedLecture, {
          fontId: wordFontId,
          includeImages: wordIncludeImages,
        });
        setMessage(
          wordIncludeImages
            ? "קובץ Word הורד בהצלחה. אם Word לא נפתח — ודאי שהקובץ לא בתוך ZIP ושיש מספיק מקום בדיסק."
            : "קובץ Word הורד בהצלחה (בלי תמונות — קובץ קל יותר לפתיחה)",
        );
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
      await exportNotebook(decodedCourse, decodedLecture, format);
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
        <div className="notebook-editor-header">
          <Link
            to={`/courses/${encodeURIComponent(decodedCourse)}`}
            className="notebook-editor-header__back"
          >
            ← {decodedCourse}
          </Link>
          <h1 className="notebook-editor-header__title">
            {viewMode === "notebook" ? "מחברת לימוד" : "סיכום למבחן"}
          </h1>
          <p className="notebook-editor-header__meta">
            {decodedLecture.replace(/_/g, " ")} · כ-
            {viewMode === "notebook" ? readingMinutes : summaryReadingMinutes} דקות קריאה
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("notebook")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                viewMode === "notebook"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              מחברת מלאה
            </button>
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                viewMode === "summary"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              סיכום למבחן
            </button>
          </div>
          {viewMode === "notebook" && (
            <>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>פונט Word:</span>
            <select
              value={wordFontId}
              onChange={handleWordFontChange}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              title="פונט לייצוא והעתקה ל-Word"
            >
              {Object.values(WORD_FONTS).map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={wordIncludeImages}
              onChange={(event) => setWordIncludeImages(event.target.checked)}
            />
            <span>כלול תמונות ב-Word</span>
          </label>
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
            {exporting === "pdf" ? "מייצא..." : "ייצוא PDF"}
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
            </>
          )}
          {viewMode === "summary" && (
            <>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={generatingSummary || loading}
                className="btn-primary"
              >
                {generatingSummary ? "מייצר..." : summaryAvailable ? "רענן סיכום" : "צור סיכום"}
              </button>
              <button
                type="button"
                onClick={handleDownloadSummaryMd}
                disabled={!summaryContent}
                className="btn-secondary"
              >
                הורד MD
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-4 p-2" aria-busy="true" aria-label="טוען מחברת">
          <div className="h-8 w-1/2 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 h-6 w-1/3 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 h-6 w-2/5 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      )}
      {loadError && <p className="flash-message flash-message--error mb-4">{loadError}</p>}
      {actionError && <p className="flash-message flash-message--error mb-4">{actionError}</p>}
      {message && <p className="flash-message flash-message--success mb-4">{message}</p>}
      {isDirty && !loading && (
        <p className="flash-message flash-message--warning mb-4">
          יש שינויים שלא נשמרו · Ctrl+S לשמירה
        </p>
      )}

      {!loading && !loadError && viewMode === "notebook" && (
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
              courseName={decodedCourse}
              lectureId={decodedLecture}
              onDirtyChange={setIsDirty}
              onHeadingsChange={refreshToc}
              focusMode={focusMode}
            />
          </div>
        </div>
      )}

      {!loading && !loadError && viewMode === "summary" && (
        <div className="notebook-canvas min-h-0 flex-1 overflow-auto rounded-xl">
          {summaryLoading && (
            <div className="space-y-4 p-6" aria-busy="true">
              <div className="h-6 w-1/3 animate-pulse rounded-lg bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
            </div>
          )}
          {!summaryLoading && !summaryAvailable && (
            <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
              <p className="text-slate-600">
                עדיין אין סיכום למבחן להרצאה זו. הסיכום נוצר מהמחברת המלאה.
              </p>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="btn-primary"
              >
                {generatingSummary ? "מייצר סיכום..." : "צור סיכום למבחן"}
              </button>
            </div>
          )}
          {!summaryLoading && summaryAvailable && (
            <MarkdownPreview
              content={summaryContent}
              courseName={decodedCourse}
              lectureId={decodedLecture}
            />
          )}
        </div>
      )}
    </div>
  );
}
