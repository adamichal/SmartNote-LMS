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
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">הקורסים שלי</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + קורס חדש
        </button>
      </div>

      {loading && <p className="text-gray-500">טוען...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && courses.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
          אין קורסים עדיין. לחץ על &quot;קורס חדש&quot; כדי להתחיל.
        </p>
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
