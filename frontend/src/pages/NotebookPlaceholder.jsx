import { Link, useParams } from "react-router-dom";

export default function NotebookPlaceholder() {
  const { courseName, lectureId } = useParams();
  const decodedCourse = decodeURIComponent(courseName);
  const decodedLecture = decodeURIComponent(lectureId);

  return (
    <div>
      <Link
        to={`/courses/${encodeURIComponent(decodedCourse)}/lectures/${encodeURIComponent(decodedLecture)}/progress`}
        className="text-sm text-indigo-600 hover:text-indigo-800"
      >
        ← חזרה למסך העיבוד
      </Link>

      <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900">עורך המחברת</h1>
        <p className="mt-4 text-gray-600">
          עיבוד המדיה וה-PDF הושלם. עריכת AI ויצירת המחברת יתווספו בשלב הבא.
        </p>
      </div>
    </div>
  );
}
