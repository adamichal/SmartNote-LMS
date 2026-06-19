const STATUS_LABELS = {
  pending: "ממתין",
  processing: "בעיבוד",
  completed: "הושלם",
  error: "שגיאה",
  unknown: "לא ידוע",
};

const STATUS_STYLES = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

export default function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status;
  const style = STATUS_STYLES[status] || STATUS_STYLES.unknown;

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
