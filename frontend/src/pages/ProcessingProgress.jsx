import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLectureStatus, retryLecture } from "../api/client";

const STAGES = [
  { key: "audio_extraction", label: "חילוץ אודיו", min: 0, max: 10 },
  { key: "transcribing", label: "תמלול (Whisper)", min: 10, max: 50 },
  { key: "pdf_processing", label: "עיבוד PDF", min: 50, max: 55 },
  { key: "ai_editing", label: "עריכת AI (Gemini)", min: 55, max: 88 },
  { key: "notebook_assembly", label: "הרכבת מחברת", min: 88, max: 100 },
];

function stageState(stageKey, currentStage, progress, status) {
  if (status === "completed") return "done";
  if (status === "error") {
    const failedIndex = STAGES.findIndex((stage) => stage.key === currentStage);
    const thisIndex = STAGES.findIndex((stage) => stage.key === stageKey);
    if (thisIndex < failedIndex) return "done";
    if (thisIndex === failedIndex) return "error";
    return "pending";
  }

  const stage = STAGES.find((item) => item.key === stageKey);
  if (!stage) return "pending";

  if (currentStage === stageKey) return "active";
  if (progress >= stage.max) return "done";
  if (progress < stage.min) return "pending";
  return "active";
}

function StageIcon({ state }) {
  if (state === "done") return <span className="text-green-600">✅</span>;
  if (state === "active") return <span className="text-blue-600">🔄</span>;
  if (state === "error") return <span className="text-red-600">❌</span>;
  return <span className="text-gray-400">⏸</span>;
}

export default function ProcessingProgress() {
  const { courseName, lectureId } = useParams();
  const decodedCourse = decodeURIComponent(courseName);
  const decodedLecture = decodeURIComponent(lectureId);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getLectureStatus(decodedLecture);
        if (cancelled) return;
        setStatus(data);
        setError("");
        return data.status;
      } catch (err) {
        if (cancelled) return;
        setError(typeof err.message === "string" ? err.message : "טעינת הסטטוס נכשלה");
        return "error";
      }
    }

    poll();
    const interval = setInterval(async () => {
      const currentStatus = await poll();
      if (currentStatus === "completed" || currentStatus === "error") {
        clearInterval(interval);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [decodedLecture, pollKey]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryLecture(decodedLecture);
      setPollKey((key) => key + 1);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "הניסיון החוזר נכשל");
    } finally {
      setRetrying(false);
    }
  }

  if (!status && !error) {
    return <p className="text-gray-500">טוען...</p>;
  }

  const progress = status?.progress_pct ?? 0;
  const jobStatus = status?.status ?? "pending";

  return (
    <div>
      <Link
        to={`/courses/${encodeURIComponent(decodedCourse)}`}
        className="text-sm text-indigo-600 hover:text-indigo-800"
      >
        ← חזרה לרשימת ההרצאות
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {jobStatus === "processing" ? "⏳ מעבד" : jobStatus === "completed" ? "✅ הושלם" : jobStatus === "error" ? "❌ שגיאה" : "ממתין"}:{" "}
          {status?.topic} — הרצאה {status?.number}
        </h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
            <span>התקדמות כללית</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                jobStatus === "error" ? "bg-red-500" : jobStatus === "completed" ? "bg-green-500" : "bg-indigo-600"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="space-y-3">
          {STAGES.map((stage) => {
            const state = stageState(stage.key, status?.stage, progress, jobStatus);
            return (
              <li
                key={stage.key}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <span className="flex items-center gap-3">
                  <StageIcon state={state} />
                  <span className="font-medium text-gray-900">{stage.label}</span>
                </span>
                <span className="text-sm text-gray-500">
                  {state === "done" ? "מושלם" : state === "active" ? "פעיל" : state === "error" ? "נכשל" : "ממתין"}
                </span>
              </li>
            );
          })}
        </ul>

        {jobStatus === "error" && status?.error && (
          <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {status.error}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-6 flex gap-3">
          {jobStatus === "completed" && status?.has_notebook && (
            <Link
              to={`/courses/${encodeURIComponent(decodedCourse)}/lectures/${encodeURIComponent(decodedLecture)}/notebook`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              הצג מחברת
            </Link>
          )}
          {(jobStatus === "error" || (jobStatus === "completed" && !status?.has_notebook)) && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {retrying ? "מנסה שוב..." : jobStatus === "completed" ? "המשך עיבוד AI" : "נסה שוב"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
