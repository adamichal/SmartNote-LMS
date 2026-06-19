import { useState } from "react";
import FileUploadInput from "./FileUploadInput";

export default function NewLectureForm({ onCreate }) {
  const [number, setNumber] = useState("");
  const [topic, setTopic] = useState("");
  const [mediaUploadId, setMediaUploadId] = useState(null);
  const [pdfUploadId, setPdfUploadId] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const uploadsComplete = Boolean(mediaUploadId && pdfUploadId);

  function resetForm() {
    setNumber("");
    setTopic("");
    setMediaUploadId(null);
    setPdfUploadId(null);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const parsedNumber = parseInt(number, 10);
    if (!parsedNumber || parsedNumber < 1) {
      setError("יש להזין מספר הרצאה תקין");
      return;
    }
    if (!topic.trim()) {
      setError("יש להזין נושא");
      return;
    }
    if (!uploadsComplete) {
      setError("יש להעלות קובץ מדיה ו-PDF לפני יצירת ההרצאה");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate(parsedNumber, topic.trim(), {
        mediaUploadId,
        pdfUploadId,
      });
      resetForm();
      setExpanded(false);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "יצירת ההרצאה נכשלה");
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        + הרצאה חדשה
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">הרצאה חדשה</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lecture-number" className="block text-sm font-medium text-gray-700">
            מספר הרצאה
          </label>
          <input
            id="lecture-number"
            type="number"
            min="1"
            max="999"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="3"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="lecture-topic" className="block text-sm font-medium text-gray-700">
            נושא
          </label>
          <input
            id="lecture-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="מערכת העצבים"
          />
        </div>

        <FileUploadInput
          id="media-file"
          label="🎬 מדיה (MP4/MP3)"
          accept=".mp4,.mp3,video/mp4,audio/mpeg,audio/mp3"
          fileType="media"
          onUploadComplete={setMediaUploadId}
          onUploadReset={() => setMediaUploadId(null)}
        />

        <FileUploadInput
          id="pdf-file"
          label="📄 מצגת (PDF)"
          accept=".pdf,application/pdf"
          fileType="pdf"
          onUploadComplete={setPdfUploadId}
          onUploadReset={() => setPdfUploadId(null)}
        />

        {error && (
          <p className="text-sm text-red-600 sm:col-span-2">{error}</p>
        )}
        <div className="flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={submitting || !uploadsComplete}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "יוצר..." : "צור הרצאה והתחל עיבוד"}
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setExpanded(false);
            }}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
