import { useEffect, useState } from "react";
import { getLectureSources } from "../api/client";

const CATEGORY_LABELS = {
  media: "מדיה",
  presentation: "מצגת",
  transcript: "תמלול",
  extra: "חומר נוסף",
};

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LectureSourcesPanel({ courseName, lectureId, compact = false }) {
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getLectureSources(courseName, lectureId)
      .then((data) => {
        if (active) setSources(data);
      })
      .catch((err) => {
        if (active) {
          setError(typeof err.message === "string" ? err.message : "טעינת המקורות נכשלה");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseName, lectureId]);

  if (loading) {
    return <p className="text-xs text-slate-500">טוען מקורות...</p>;
  }
  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }
  if (!sources?.items?.length) {
    return <p className="text-xs text-slate-500">לא נמצאו מקורות להרצאה זו.</p>;
  }

  if (compact) {
    const chips = Object.entries(sources.summary || {})
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${CATEGORY_LABELS[category] || category} (${count})`);
    return (
      <p className="text-xs text-slate-600">
        מקורות: {chips.join(" · ")}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">מקורות שהועלו</p>
      <ul className="mt-2 space-y-1.5">
        {sources.items.map((item, index) => (
          <li key={`${item.filename}-${index}`} className="text-xs text-slate-600">
            <span className="font-medium text-slate-800">
              {CATEGORY_LABELS[item.category] || item.category}:
            </span>{" "}
            {item.original_name || item.filename}
            {item.size_bytes ? ` (${formatSize(item.size_bytes)})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
