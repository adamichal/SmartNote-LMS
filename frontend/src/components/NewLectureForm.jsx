import { useState } from "react";
import FileUploadInput from "./FileUploadInput";
import MultiUploadSlots from "./MultiUploadSlots";
import PresentationBulkUpload from "./PresentationBulkUpload";

export default function NewLectureForm({ onCreate }) {
  const [number, setNumber] = useState("");
  const [topic, setTopic] = useState("");
  const [mediaUploadId, setMediaUploadId] = useState(null);
  const [presentationUploadIds, setPresentationUploadIds] = useState([]);
  const [transcriptUploads, setTranscriptUploads] = useState([]);
  const [transcriptText, setTranscriptText] = useState("");
  const [extraMaterialUploads, setExtraMaterialUploads] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const transcriptUploadIds = transcriptUploads.filter(Boolean);
  const extraMaterialUploadIds = extraMaterialUploads.filter(Boolean);

  const hasSource = Boolean(
    mediaUploadId
      || presentationUploadIds.length
      || transcriptUploadIds.length
      || transcriptText.trim(),
  );
  const canSubmit = hasSource;

  function resetForm() {
    setNumber("");
    setTopic("");
    setMediaUploadId(null);
    setPresentationUploadIds([]);
    setTranscriptUploads([]);
    setTranscriptText("");
    setExtraMaterialUploads([]);
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
    if (!hasSource) {
      setError("יש להעלות לפחות מקור אחד: מדיה, מצגת, תמלול (קובץ או הדבקה)");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await onCreate(parsedNumber, topic.trim(), {
        mediaUploadId,
        pdfUploadIds: presentationUploadIds,
        transcriptUploadIds,
        transcriptText: transcriptText.trim() || null,
        extraMaterialUploadIds,
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
      <p className="mt-1 text-sm text-gray-500">
        ניתן להעלות מצגות, תמלול ומדיה בכל שילוב — לפחות מקור אחד נדרש.
      </p>
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
          label="מדיה (MP4/MP3) — אופציונלי"
          accept=".mp4,.mp3,video/mp4,audio/mpeg,audio/mp3"
          fileType="media"
          onUploadComplete={setMediaUploadId}
          onUploadReset={() => setMediaUploadId(null)}
        />

        <MultiUploadSlots
          title="תמלולים (TXT) — אופציונלי"
          hint="אם הועלה תמלול, Whisper לא ירוץ. ניתן להעלות כמה קבצים."
          addLabel="+ הוסף תמלול"
          slotLabel={(index) => `תמלול #${index + 1}`}
          uploads={transcriptUploads}
          onChange={setTranscriptUploads}
          fileType="transcript"
          accept=".txt,text/plain"
          emptyHint="הוסף תמלול אם אין מדיה, או כדי לדלג על תמלול אוטומטי."
        />

        <div className="sm:col-span-2">
          <label htmlFor="transcript-text" className="block text-sm font-medium text-gray-700">
            או הדבק תמלול — אופציונלי
          </label>
          <p className="mt-1 text-xs text-gray-500">
            ניתן להדביק טקסט ישירות במקום להעלות קובץ. אם הועבר תמלול, Whisper לא ירוץ.
          </p>
          <textarea
            id="transcript-text"
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            rows={6}
            dir="auto"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-sans text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="הדבק כאן את התמלול..."
          />
        </div>

        <PresentationBulkUpload
          uploadIds={presentationUploadIds}
          onChange={setPresentationUploadIds}
        />

        <MultiUploadSlots
          title="חומרים נוספים (PDF / TXT / MD) — אופציונלי"
          hint="מקורות עזר (סילבוס, מאמרים, הערות) — לא מצגות ההרצאה עצמה."
          addLabel="+ הוסף חומר"
          slotLabel={(index) => `חומר #${index + 1}`}
          uploads={extraMaterialUploads}
          onChange={setExtraMaterialUploads}
          fileType="lecture_extra"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          emptyHint="חומרי עזר שיסייעו ל-AI בנוסף למצגות."
        />

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
