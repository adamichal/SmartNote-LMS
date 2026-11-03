import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createLecture, deleteLecture, exportCourseExamSummariesPdf, exportCourseNotebooksPdf, exportCourseNotebooksZip, getLectures, retryAllLecturesAi } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import CourseContextPanel from "../components/CourseContextPanel";
import LectureSourcesPanel from "../components/LectureSourcesPanel";
import NewLectureForm from "../components/NewLectureForm";
import StatusBadge from "../components/StatusBadge";
import { downloadCourseNotebooksDocxZip, getWordExportFont } from "../utils/wordExport";

export default function LectureList() {
  const { courseName } = useParams();
  const navigate = useNavigate();
  const decodedName = decodeURIComponent(courseName);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lectureToDelete, setLectureToDelete] = useState(null);
  const [expandedSourcesId, setExpandedSourcesId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingSummariesPdf, setExportingSummariesPdf] = useState(false);
  const [exportingWordZip, setExportingWordZip] = useState(false);
  const [wordExportProgress, setWordExportProgress] = useState(null);
  const [wordIncludeImages, setWordIncludeImages] = useState(true);
  const [retryingAllAi, setRetryingAllAi] = useState(false);
  const [retryAllMessage, setRetryAllMessage] = useState("");
  const [wordExportMessage, setWordExportMessage] = useState("");

  const loadLectures = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getLectures(decodedName);
      setLectures(data);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "טעינת ההרצאות נכשלה");
    } finally {
      setLoading(false);
    }
  }, [decodedName]);

  useEffect(() => {
    loadLectures();
  }, [loadLectures]);

  useEffect(() => {
    const needsPolling = lectures.some(
      (lecture) => lecture.status === "pending" || lecture.status === "processing",
    );
    if (!needsPolling) return undefined;
    const intervalId = setInterval(loadLectures, 5000);
    return () => clearInterval(intervalId);
  }, [lectures, loadLectures]);

  async function handleCreateLecture(number, topic, uploads = {}) {
    const lecture = await createLecture(decodedName, number, topic, uploads);
    navigate(
      `/courses/${encodeURIComponent(decodedName)}/lectures/${encodeURIComponent(lecture.id)}/progress`,
    );
  }

  async function handleRetryAllAi() {
    // each lecture = 2 Gemini calls (notebook + exam summary), so say the numbers up front
    const count = lectures.length;
    if (!window.confirm(
      `לעבד מחדש עם AI את כל ${count} ההרצאות?\n\n`
      + `זה יפעיל עד ${count * 2} קריאות ל-Gemini (מחברת + סיכום לכל הרצאה) — בתשלום.\n`
      + "העיבוד לוקח זמן: כמה דקות לכל הרצאה, 3 במקביל.\n\n"
      + "התמלולים, המצגות והחומרים נשמרים. המחברות הקיימות נשמרות כגיבוי בתיקיית backup.",
    )) {
      return;
    }
    setRetryingAllAi(true);
    setRetryAllMessage("");
    setError("");
    try {
      const result = await retryAllLecturesAi(decodedName);
      setRetryAllMessage(
        `נשלחו ${result.queued} הרצאות לתור. 3 מעובדות במקביל — השאר יופיעו כ"ממתין" ויתחילו אוטומטית.`,
      );
      await loadLectures();
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "עיבוד AI מחדש נכשל");
    } finally {
      setRetryingAllAi(false);
    }
  }

  async function handleExportCoursePdfs() {
    setExportingPdf(true);
    setError("");
    try {
      await exportCourseNotebooksPdf(decodedName);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "הורדת המחברות נכשלה");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportCourseSummariesPdf() {
    setExportingSummariesPdf(true);
    setError("");
    try {
      await exportCourseExamSummariesPdf(decodedName);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "הורדת הסיכומים נכשלה");
    } finally {
      setExportingSummariesPdf(false);
    }
  }

  async function handleExportCoursePdfsZip() {
    setExportingZip(true);
    setError("");
    try {
      await exportCourseNotebooksZip(decodedName);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "הורדת ZIP נכשלה");
    } finally {
      setExportingZip(false);
    }
  }

  async function handleExportCourseWord() {
    setExportingWordZip(true);
    setWordExportProgress(null);
    setWordExportMessage("");
    setError("");
    try {
      const result = await downloadCourseNotebooksDocxZip(decodedName, lectures, {
        fontId: getWordExportFont(),
        includeImages: wordIncludeImages,
        onProgress: ({ done, total, lecture }) => {
          setWordExportProgress(
            lecture
              ? { done, total, label: `הרצאה ${lecture.number}: ${lecture.topic}` }
              : { done, total },
          );
        },
      });
      if (result.failed > 0) {
        setWordExportMessage(
          `הורדו ${result.exported} מחברות. ${result.failed} נכשלו — פרטים ב-_export_errors.txt בתוך ה-ZIP.`,
        );
      } else {
        setWordExportMessage(
          `הורדו ${result.exported} מחברות. חשוב: חלצי את הקבצים מה-ZIP לפני פתיחה ב-Word (לא לפתוח ישירות מתוך הארכיון).`,
        );
      }
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "הורדת המחברות כ-Word נכשלה");
    } finally {
      setExportingWordZip(false);
      setWordExportProgress(null);
    }
  }

  async function handleConfirmDelete() {
    if (!lectureToDelete) return;
    const deletedId = lectureToDelete.id;
    setDeleting(true);
    setError("");
    setLectureToDelete(null);
    setLectures((prev) => prev.filter((l) => l.id !== deletedId));
    try {
      await deleteLecture(decodedName, deletedId);
    } catch (err) {
      await loadLectures();
      setError(typeof err.message === "string" ? err.message : "מחיקת ההרצאה נכשלה");
    } finally {
      setDeleting(false);
    }
  }

  const completedCount = lectures.filter((lecture) => lecture.status === "completed").length;

  return (
    <div>
      <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-800">
        ← חזרה לדשבורד
      </Link>

      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{decodedName}</h1>
          <p className="mt-1 text-slate-500">
            {lectures.length} הרצאות · {completedCount} מחברות מוכנות
          </p>
        </div>
        {lectures.length > 0 && (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleRetryAllAi}
              disabled={retryingAllAi || exportingWordZip || exportingZip || exportingPdf || exportingSummariesPdf}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {retryingAllAi ? "שולח לעיבוד..." : "עבד AI מחדש לכל ההרצאות"}
            </button>
          </div>
        )}
        {completedCount > 0 && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={wordIncludeImages}
                  onChange={(event) => setWordIncludeImages(event.target.checked)}
                  disabled={exportingWordZip || exportingZip || exportingPdf || exportingSummariesPdf}
                />
                <span>כלול תמונות ב-Word</span>
              </label>
              <button
                type="button"
                onClick={handleExportCourseWord}
                disabled={exportingWordZip || exportingZip || exportingPdf || exportingSummariesPdf}
                className="btn-secondary"
              >
                {exportingWordZip
                  ? wordExportProgress
                    ? wordExportProgress.done >= wordExportProgress.total
                      ? "מסיים הורדה..."
                      : `מייצא Word (${wordExportProgress.done + 1}/${wordExportProgress.total})...`
                    : "מכין Word..."
                  : "הורד כל המחברות כ-Word"}
              </button>
              <button
                type="button"
                onClick={handleExportCoursePdfs}
                disabled={exportingPdf || exportingWordZip || exportingZip || exportingSummariesPdf}
                className="btn-primary"
              >
                {exportingPdf ? "מייצא PDF..." : "הורד כל המחברות כ-PDF אחד"}
              </button>
              <button
                type="button"
                onClick={handleExportCourseSummariesPdf}
                disabled={exportingSummariesPdf || exportingWordZip || exportingZip || exportingPdf}
                className="btn-secondary"
              >
                {exportingSummariesPdf ? "מייצא סיכומים..." : "הורד כל הסיכומים כ-PDF אחד"}
              </button>
              <button
                type="button"
                onClick={handleExportCoursePdfsZip}
                disabled={exportingZip || exportingWordZip || exportingPdf || exportingSummariesPdf}
                className="btn-secondary"
                title="קובץ ZIP עם PDF נפרד לכל הרצאה"
              >
                {exportingZip ? "מוריד ZIP..." : "ZIP (PDF לכל הרצאה)"}
              </button>
            </div>
            {wordExportMessage && (
              <p className="max-w-xl text-right text-sm text-emerald-700">{wordExportMessage}</p>
            )}
          </div>
        )}
      </div>

      {retryAllMessage && (
        <p className="mb-4 text-sm text-amber-800">{retryAllMessage}</p>
      )}

      <div className="mb-8">
        <CourseContextPanel courseName={decodedName} />
      </div>

      <div className="mb-8">
        <NewLectureForm onCreate={handleCreateLecture} />
      </div>

      {loading && (
        <ul className="space-y-3" aria-busy="true" aria-label="טוען הרצאות">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="flash-message flash-message--error">{error}</p>}

      {!loading && !error && lectures.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-4xl">🎓</p>
          <p className="mt-3 text-slate-600">אין הרצאות בקורס זה עדיין.</p>
          <p className="mt-1 text-sm text-slate-500">העלה לפחות מקור אחד: מדיה, מצגת, או תמלול.</p>
        </div>
      )}

      {!loading && lectures.length > 0 && (
        <ul className="space-y-3">
          {lectures.map((lecture) => (
            <li
              key={lecture.id}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-indigo-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    הרצאה {lecture.number}: {lecture.topic}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={lecture.status} />
                  </div>
                  <LectureSourcesPanel
                    courseName={decodedName}
                    lectureId={lecture.id}
                    compact
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSourcesId((current) =>
                        current === lecture.id ? null : lecture.id,
                      )
                    }
                    className="btn-secondary"
                  >
                    {expandedSourcesId === lecture.id ? "הסתר מקורות" : "מקורות"}
                  </button>
                  {/* show it whenever the file exists, even if the status got stuck */}
                  {(lecture.status === "completed" || lecture.has_notebook) && (
                    <Link
                      to={`/courses/${encodeURIComponent(decodedName)}/lectures/${encodeURIComponent(lecture.id)}/notebook`}
                      className="btn-primary"
                    >
                      פתח מחברת
                    </Link>
                  )}
                  <Link
                    to={`/courses/${encodeURIComponent(decodedName)}/lectures/${encodeURIComponent(lecture.id)}/progress`}
                    className="btn-secondary"
                  >
                    {lecture.status === "completed" ? "סטטוס" : "המשך עיבוד"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setLectureToDelete(lecture)}
                    className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    מחק
                  </button>
                </div>
              </div>
              {expandedSourcesId === lecture.id && (
                <LectureSourcesPanel
                  courseName={decodedName}
                  lectureId={lecture.id}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {lectureToDelete && (
        <ConfirmDialog
          title="מחיקת הרצאה"
          message={`האם למחוק את הרצאה ${lectureToDelete.number}: ${lectureToDelete.topic}? פעולה זו בלתי הפיכה.`}
          confirmLabel="מחק הרצאה"
          loading={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setLectureToDelete(null)}
        />
      )}
    </div>
  );
}
