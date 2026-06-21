import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createLecture, deleteLecture, getLectures } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import CourseContextPanel from "../components/CourseContextPanel";
import NewLectureForm from "../components/NewLectureForm";
import StatusBadge from "../components/StatusBadge";

export default function LectureList() {
  const { courseName } = useParams();
  const navigate = useNavigate();
  const decodedName = decodeURIComponent(courseName);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lectureToDelete, setLectureToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  async function handleCreateLecture(number, topic, uploads = {}) {
    const lecture = await createLecture(decodedName, number, topic, uploads);
    navigate(
      `/courses/${encodeURIComponent(decodedName)}/lectures/${encodeURIComponent(lecture.id)}/progress`,
    );
  }

  async function handleConfirmDelete() {
    if (!lectureToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteLecture(decodedName, lectureToDelete.id);
      setLectureToDelete(null);
      await loadLectures();
    } catch (err) {
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
      </div>

      <div className="mb-8">
        <CourseContextPanel courseName={decodedName} />
      </div>

      <div className="mb-8">
        <NewLectureForm onCreate={handleCreateLecture} />
      </div>

      {loading && <p className="text-slate-500">טוען...</p>}
      {error && <p className="flash-message flash-message--error">{error}</p>}

      {!loading && !error && lectures.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-4xl">🎓</p>
          <p className="mt-3 text-slate-600">אין הרצאות בקורס זה עדיין.</p>
          <p className="mt-1 text-sm text-slate-500">העלה מדיה + PDF (או תמלול) כדי להתחיל.</p>
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
                </div>
                <div className="flex flex-wrap gap-2">
                  {lecture.status === "completed" && (
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
