import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { exportNotebook, getNotebook, openNotebookPrintView, saveNotebook } from "../api/client";
import VisualNotebookEditor from "../components/VisualNotebookEditor";
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getNotebook(decodedLecture);
        setContent(data.content);
        setIsDirty(false);
      } catch (err) {
        setLoadError(typeof err.message === "string" ? err.message : "טעינת המחברת נכשלה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [decodedLecture]);

  async function handleSave() {
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
  }

  async function handleExport(format) {
    if (isDirty) {
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
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/courses/${encodeURIComponent(decodedCourse)}/lectures/${encodeURIComponent(decodedLecture)}/progress`}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          ← חזרה למסך העיבוד
        </Link>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("md")}
            disabled={Boolean(exporting) || isDirty}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === "md" ? "מייצא..." : "ייצוא MD"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={Boolean(exporting) || isDirty}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === "pdf" ? "פותח..." : "ייצוא PDF"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("docx")}
            disabled={Boolean(exporting) || isDirty}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === "docx" ? "מייצא..." : "ייצוא DOCX"}
          </button>
        </div>
      </div>

      <h1 className="mb-4 text-2xl font-bold text-gray-900">עורך מחברת</h1>

      {loading && <p className="text-gray-500">טוען מחברת...</p>}
      {loadError && <p className="mb-4 text-sm text-red-600">{loadError}</p>}
      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      {message && <p className="mb-4 text-sm text-green-600">{message}</p>}
      {isDirty && !loading && (
        <p className="mb-4 text-sm text-amber-600">יש שינויים שלא נשמרו</p>
      )}

      {!loading && !loadError && (
        <VisualNotebookEditor
          ref={editorRef}
          content={content}
          lectureId={decodedLecture}
          onDirtyChange={setIsDirty}
        />
      )}
    </div>
  );
}
