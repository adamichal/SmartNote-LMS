import { Link } from "react-router-dom";

export default function CourseCard({ course, onDelete }) {
  return (
    <div className="relative rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
      <Link to={`/courses/${encodeURIComponent(course.name)}`} className="block">
        <h2 className="text-lg font-semibold text-gray-900">{course.name}</h2>
        <p className="mt-2 text-sm text-gray-500">
          {course.lecture_count === 1 ? "הרצאה אחת" : `${course.lecture_count} הרצאות`}
        </p>
      </Link>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          onDelete(course);
        }}
        className="absolute left-4 top-4 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        title="מחק קורס"
      >
        מחק
      </button>
    </div>
  );
}
