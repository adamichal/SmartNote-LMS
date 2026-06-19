import { useState } from "react";
import FileUploadInput from "./FileUploadInput";

function ExtraPdfUploads({ uploads, onChange }) {
  function addSlot() {
    onChange([...uploads, null]);
  }

  function setUploadId(index, uploadId) {
    const next = [...uploads];
    next[index] = uploadId;
    onChange(next);
  }

  function resetUpload(index) {
    const next = [...uploads];
    next[index] = null;
    onChange(next);
  }

  function removeSlot(index) {
    onChange(uploads.filter((_, slotIndex) => slotIndex !== index));
  }

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <span className="block text-sm font-medium text-gray-700">
          📚 חומרי עזר נוספים (PDF, אופציונלי)
        </span>
        <button
          type="button"
          onClick={addSlot}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          + הוסף PDF
        </button>
      </div>
      {uploads.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          ניתן להוסיף מקורות PDF נוספים שיסייעו ל-AI ביצירת הסיכום.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {uploads.map((uploadId, index) => (
          <div key={index} className="rounded-lg border border-gray-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">PDF #{index + 1}</span>
              <button
                type="button"
                onClick={() => removeSlot(index)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                הסר
              </button>
            </div>
            <FileUploadInput
              id={`extra-pdf-${index}`}
              label=""
              accept=".pdf,application/pdf"
              fileType="pdf_extra"
              compact
              onUploadComplete={(id) => setUploadId(index, id)}
              onUploadReset={() => resetUpload(index)}
            />
            {uploadId && (
              <p className="mt-1 text-xs text-green-600">הקובץ הועלה בהצלחה</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NewLectureForm({ onCreate }) {
  const [number, setNumber] = useState("");
  const [topic, setTopic] = useState("");
  const [mediaUploadId, setMediaUploadId] = useState(null);
  const [pdfUploadId, setPdfUploadId] = useState(null);
  const [transcriptUploadId, setTranscriptUploadId] = useState(null);
  const [extraPdfUploads, setExtraPdfUploads] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hasMediaOrTranscript = Boolean(mediaUploadId || transcriptUploadId);
  const canSubmit = Boolean(pdfUploadId && hasMediaOrTranscript);
  const extraPdfUploadIds = extraPdfUploads.filter(Boolean);

  function resetForm() {
    setNumber("");
    setTopic("");
    setMediaUploadId(null);
    setPdfUploadId(null);
    setTranscriptUploadId(null);
    setExtraPdfUploads([]);
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
    if (!canSubmit) {
      setError("יש להעלות מצגת PDF, וגם מדיה או קובץ תמלול");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate(parsedNumber, topic.trim(), {
        mediaUploadId,
        pdfUploadId,
        transcriptUploadId,
        pdfExtraUploadIds: extraPdfUploadIds,
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
          label={`🎬 מדיה (MP4/MP3)${transcriptUploadId ? " — אופציונלי" : ""}`}
          accept=".mp4,.mp3,video/mp4,audio/mpeg,audio/mp3"
          fileType="media"
          onUploadComplete={setMediaUploadId}
          onUploadReset={() => setMediaUploadId(null)}
        />

        <FileUploadInput
          id="transcript-file"
          label={`📝 תמלול (TXT)${mediaUploadId ? " — אופציונלי, מדלג על Whisper" : ""}`}
          accept=".txt,text/plain"
          fileType="transcript"
          onUploadComplete={setTranscriptUploadId}
          onUploadReset={() => setTranscriptUploadId(null)}
        />

        <FileUploadInput
          id="pdf-file"
          label="📄 מצגת (PDF)"
          accept=".pdf,application/pdf"
          fileType="pdf"
          onUploadComplete={setPdfUploadId}
          onUploadReset={() => setPdfUploadId(null)}
        />

        <ExtraPdfUploads uploads={extraPdfUploads} onChange={setExtraPdfUploads} />

        {error && (
          <p className="text-sm text-red-600 sm:col-span-2">{error}</p>
        )}
        <div className="flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
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
