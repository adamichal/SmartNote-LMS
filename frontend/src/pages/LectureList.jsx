import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createLecture, getLectures } from "../api/client";
import NewLectureForm from "../components/NewLectureForm";
import StatusBadge from "../components/StatusBadge";

export default function LectureList() {
  const { courseName } = useParams();
  const decodedName = decodeURIComponent(courseName);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  async function handleCreateLecture(number, topic) {
    await createLecture(decodedName, number, topic);
    await loadLectures();
  }

  return (
    <div>
      <Link to="/" className="text-sm text-indigo-600 hover:text-indigo-800">
        ← חזרה לדשבורד
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{decodedName}</h1>
        <p className="mt-1 text-gray-500">רשימת הרצאות</p>
      </div>

      <div className="mb-8">
        <NewLectureForm onCreate={handleCreateLecture} />
      </div>

      {loading && <p className="text-gray-500">טוען...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && lectures.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
          אין הרצאות בקורס זה. לחץ על &quot;הרצאה חדשה&quot; כדי להוסיף.
        </p>
      )}

      {!loading && lectures.length > 0 && (
        <ul className="space-y-3">
          {lectures.map((lecture) => (
            <li
              key={lecture.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm"
            >
              <div>
                <span className="font-medium text-gray-900">
                  הרצאה {lecture.number}: {lecture.topic}
                </span>
              </div>
              <StatusBadge status={lecture.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
