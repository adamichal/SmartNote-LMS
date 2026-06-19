import { useState } from "react";
import PathInput from "./PathInput";

export default function NewLectureForm({ onCreate }) {
  const [number, setNumber] = useState("");
  const [topic, setTopic] = useState("");
  const [mediaPath, setMediaPath] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [mediaValid, setMediaValid] = useState(null);
  const [pdfValid, setPdfValid] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function resetForm() {
    setNumber("");
    setTopic("");
    setMediaPath("");
    setPdfPath("");
    setMediaValid(null);
    setPdfValid(null);
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
    if (mediaPath.trim() && mediaValid !== true) {
      setError("נתיב המדיה אינו תקין או עדיין נבדק");
      return;
    }
    if (pdfPath.trim() && pdfValid !== true) {
      setError("נתיב ה-PDF אינו תקין או עדיין נבדק");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate(parsedNumber, topic.trim(), {
        mediaPath: mediaPath.trim() || null,
        pdfPath: pdfPath.trim() || null,
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

        <PathInput
          id="media-path"
          label="🎬 מדיה (MP4/MP3) — נתיב מקומי"
          placeholder="C:\Lectures\lecture.mp4"
          fileType="media"
          value={mediaPath}
          onChange={setMediaPath}
          onValidationChange={setMediaValid}
        />

        <PathInput
          id="pdf-path"
          label="📄 מצגת (PDF) — נתיב מקומי"
          placeholder="C:\Lectures\slides.pdf"
          fileType="pdf"
          value={pdfPath}
          onChange={setPdfPath}
          onValidationChange={setPdfValid}
        />

        {error && (
          <p className="text-sm text-red-600 sm:col-span-2">{error}</p>
        )}
        <div className="flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "יוצר..." : "צור הרצאה"}
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
