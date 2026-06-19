import { Link } from "react-router-dom";

export default function CourseCard({ course }) {
  return (
    <Link
      to={`/courses/${encodeURIComponent(course.name)}`}
      className="block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      <h2 className="text-lg font-semibold text-gray-900">{course.name}</h2>
      <p className="mt-2 text-sm text-gray-500">
        {course.lecture_count === 1 ? "הרצאה אחת" : `${course.lecture_count} הרצאות`}
      </p>
    </Link>
  );
}
