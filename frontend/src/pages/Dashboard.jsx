import { useCallback, useEffect, useState } from "react";
import { createCourse, deleteCourse, getCourses } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import CourseCard from "../components/CourseCard";
import NewCourseModal from "../components/NewCourseModal";

export default function Dashboard() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCourses();
      setCourses(data);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "טעינת הקורסים נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  async function handleCreateCourse(name) {
    await createCourse(name);
    await loadCourses();
  }

  async function handleConfirmDelete() {
    if (!courseToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteCourse(courseToDelete.name);
      setCourseToDelete(null);
      await loadCourses();
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "מחיקת הקורס נכשלה");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">הקורסים שלי</h1>
          <p className="mt-1 text-slate-500">המר הרצאות למחברות לימוד מסודרות</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary"
        >
          + קורס חדש
        </button>
      </div>

      {loading && <p className="text-gray-500">טוען...</p>}
      {error && <p className="flash-message flash-message--error">{error}</p>}

      {!loading && !error && courses.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-4xl">📓</p>
          <p className="mt-3 text-slate-600">אין קורסים עדיין</p>
          <p className="mt-1 text-sm text-slate-500">צור קורס חדש והעלה את ההרצאה הראשונה שלך.</p>
        </div>
      )}

      {!loading && courses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.name}
              course={course}
              onDelete={setCourseToDelete}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewCourseModal
          onClose={() => setModalOpen(false)}
          onCreate={handleCreateCourse}
        />
      )}

      {courseToDelete && (
        <ConfirmDialog
          title="מחיקת קורס"
          message={`האם למחוק את הקורס "${courseToDelete.name}" וכל ההרצאות שבו? פעולה זו בלתי הפיכה.`}
          confirmLabel="מחק קורס"
          loading={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setCourseToDelete(null)}
        />
      )}
    </div>
  );
}
