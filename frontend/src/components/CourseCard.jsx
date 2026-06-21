import { Link } from "react-router-dom";

export default function CourseCard({ course, onDelete }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-indigo-500 to-violet-400 opacity-0 transition group-hover:opacity-100" />
      <Link to={`/courses/${encodeURIComponent(course.name)}`} className="block">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-xl">
          📚
        </div>
        <h2 className="text-lg font-bold text-slate-900">{course.name}</h2>
        <p className="mt-2 text-sm text-slate-500">
          {course.lecture_count === 1 ? "הרצאה אחת" : `${course.lecture_count} הרצאות`}
        </p>
        <p className="mt-4 text-sm font-medium text-indigo-600">פתח קורס ←</p>
      </Link>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          onDelete(course);
        }}
        className="absolute left-4 top-4 rounded-lg px-2 py-1 text-xs text-red-600 opacity-0 transition hover:bg-red-50 group-hover:opacity-100"
        title="מחק קורס"
      >
        מחק
      </button>
    </div>
  );
}
