import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { retryLecture, retryLectureAiOnly } from "../api/client";

const STAGES = [
  { key: "audio_extraction", label: "חילוץ אודיו", min: 0, max: 10 },
  { key: "transcribing", label: "תמלול (Whisper)", min: 10, max: 50 },
  { key: "pdf_processing", label: "עיבוד PDF", min: 50, max: 55 },
  { key: "ai_editing", label: "עריכת AI (Gemini)", min: 55, max: 88 },
  { key: "notebook_assembly", label: "הרכבת מחברת", min: 88, max: 100 },
];

function stageState(stageKey, currentStage, progress, status, skippedStages = []) {
  if (skippedStages.includes(stageKey)) return "skipped";
  if (status === "completed") return "done";
  if (status === "error") {
    const failedIndex = STAGES.findIndex((stage) => stage.key === currentStage);
    const thisIndex = STAGES.findIndex((stage) => stage.key === stageKey);
    if (thisIndex < failedIndex) return "done";
    if (thisIndex === failedIndex) return "error";
    return "pending";
  }
  if (status === "pending") return "pending";

  const stage = STAGES.find((item) => item.key === stageKey);
  if (!stage) return "pending";

  if (currentStage === stageKey) return "active";
  if (progress >= stage.max) return "done";
  if (progress < stage.min) return "pending";
  return "active";
}

function StageIcon({ state }) {
  if (state === "done") return <span className="text-green-600">✓</span>;
  if (state === "skipped") return <span className="text-slate-400">⏭</span>;
  if (state === "active") return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />;
  if (state === "error") return <span className="text-red-600">✕</span>;
  return <span className="text-slate-300">○</span>;
}

function stageLabel(state) {
  if (state === "done") return "מושלם";
  if (state === "skipped") return "דולג";
  if (state === "active") return "פעיל";
  if (state === "error") return "נכשל";
  return "ממתין";
}

function stageCardClass(state) {
  if (state === "active") return "stage-card stage-card--active";
  if (state === "done") return "stage-card stage-card--done";
  if (state === "error") return "stage-card stage-card--error";
  return "stage-card";
}

export default function ProcessingProgress() {
  const { courseName, lectureId } = useParams();
  const decodedCourse = decodeURIComponent(courseName);
  const decodedLecture = decodeURIComponent(lectureId);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

  useEffect(() => {
    const url = `/api/courses/${encodeURIComponent(decodedCourse)}/lectures/${encodeURIComponent(decodedLecture)}/status/stream`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stream_error) {
          setError(data.stream_error);
          es.close();
          return;
        }
        setStatus(data);
        setError("");
        if (data.status === "completed" || data.status === "error") {
          es.close();
        }
      } catch {
        setError("שגיאה בקריאת נתוני סטטוס");
        es.close();
      }
    };

    es.onerror = () => {
      setError("חיבור לשרת אבד — רענן את הדף");
      es.close();
    };

    return () => es.close();
  }, [decodedCourse, decodedLecture, streamKey]);

  async function handleRetry() {
    setRetrying(true);
    setError("");
    try {
      await retryLecture(decodedCourse, decodedLecture);
      setStreamKey((k) => k + 1);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "הניסיון החוזר נכשל");
    } finally {
      setRetrying(false);
    }
  }

  async function handleRetryAiOnly() {
    setRetrying(true);
    setError("");
    try {
      await retryLectureAiOnly(decodedCourse, decodedLecture);
      setStreamKey((k) => k + 1);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "עיבוד AI מחדש נכשל");
    } finally {
      setRetrying(false);
    }
  }

  if (!status && !error) {
    return <p className="text-slate-500">מתחבר לשרת...</p>;
  }

  const progress = status?.progress_pct ?? 0;
  const jobStatus = status?.status ?? "pending";
  const skippedStages = status?.skipped_stages ?? [];

  const statusTitle =
    jobStatus === "processing"
      ? "מעבד הרצאה"
      : jobStatus === "completed"
        ? "העיבוד הושלם"
        : jobStatus === "error"
          ? "שגיאה בעיבוד"
          : "ממתין לעיבוד";

  const canRetryAiOnly =
    (jobStatus === "completed" || jobStatus === "error") &&
    (status?.stage === "ai_editing" || status?.stage === "notebook_assembly" || jobStatus === "completed");

  return (
    <div>
      <Link
        to={`/courses/${encodeURIComponent(decodedCourse)}`}
        className="text-sm text-indigo-600 hover:text-indigo-800"
      >
        ← חזרה לרשימת ההרצאות
      </Link>

      <div className="mt-4 mb-8">
        <p className="text-sm font-medium text-indigo-600">{statusTitle}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {status?.topic} — הרצאה {status?.number}
        </h1>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>התקדמות כללית</span>
            <span className="font-semibold text-slate-900">{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                jobStatus === "error"
                  ? "bg-red-500"
                  : jobStatus === "completed"
                    ? "bg-emerald-500"
                    : "bg-indigo-600"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="space-y-3">
          {STAGES.map((stage) => {
            const state = stageState(
              stage.key,
              status?.stage,
              progress,
              jobStatus,
              skippedStages,
            );
            return (
              <li
                key={stage.key}
                className={`flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 ${stageCardClass(state)}`}
              >
                <span className="flex items-center gap-3">
                  <StageIcon state={state} />
                  <span className="font-medium text-slate-900">{stage.label}</span>
                </span>
                <span className="text-sm text-slate-500">{stageLabel(state)}</span>
              </li>
            );
          })}
        </ul>

        {jobStatus === "error" && status?.error && (
          <div className="flash-message flash-message--error mt-6">{status.error}</div>
        )}

        {error && <div className="flash-message flash-message--error mt-4">{error}</div>}

        <div className="mt-6 flex flex-wrap gap-3">
          {jobStatus === "completed" && status?.has_notebook && (
            <Link
              to={`/courses/${encodeURIComponent(decodedCourse)}/lectures/${encodeURIComponent(decodedLecture)}/notebook`}
              className="btn-primary"
            >
              פתח מחברת
            </Link>
          )}

          {canRetryAiOnly && (
            <button
              type="button"
              onClick={handleRetryAiOnly}
              disabled={retrying}
              className="btn-secondary disabled:opacity-50"
              title="מריץ מחדש רק את שלב Gemini ואת הרכבת המחברת — ללא תמלול מחדש"
            >
              {retrying ? "מעבד..." : "עבד AI מחדש"}
            </button>
          )}

          {(jobStatus === "error" || (jobStatus === "completed" && !status?.has_notebook)) && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="btn-primary disabled:opacity-50"
            >
              {retrying ? "מנסה שוב..." : "נסה שוב מההתחלה"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
