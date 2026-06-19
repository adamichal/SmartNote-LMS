import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { exportNotebook, getNotebook, saveNotebook } from "../api/client";
import MarkdownPreview from "../components/MarkdownPreview";
import "katex/dist/katex.min.css";

export default function NotebookEditor() {
  const { courseName, lectureId } = useParams();
  const decodedCourse = decodeURIComponent(courseName);
  const decodedLecture = decodeURIComponent(lectureId);

  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const isDirty = content !== savedContent;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getNotebook(decodedLecture);
        setContent(data.content);
        setSavedContent(data.content);
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
      await saveNotebook(decodedLecture, content);
      setSavedContent(content);
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
            {exporting === "pdf" ? "מייצא..." : "ייצוא PDF"}
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
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
              Markdown
            </div>
            <textarea
              dir="rtl"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="notebook-editor min-h-0 flex-1 resize-none border-0 p-4 font-mono text-sm leading-relaxed focus:outline-none"
              spellCheck={false}
            />
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
              תצוגה מקדימה
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MarkdownPreview content={content} lectureId={decodedLecture} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
