import { useRef, useState } from "react";
import { uploadFile } from "../api/client";

const EXTENSIONS_BY_TYPE = {
  media: [".mp4", ".mp3"],
  pdf: [".pdf"],
  pdf_extra: [".pdf"],
  transcript: [".txt"],
};

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function validateExtension(filename, fileType) {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const allowed = EXTENSIONS_BY_TYPE[fileType] || [];
  return allowed.includes(extension);
}

export default function FileUploadInput({
  id,
  label,
  accept,
  fileType,
  compact = false,
  onUploadComplete,
  onUploadReset,
}) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!validateExtension(file.name, fileType)) {
      setError("סוג קובץ לא נתמך");
      setStatus("error");
      onUploadReset?.();
      return;
    }

    setFileName(file.name);
    setStatus("uploading");
    setProgress(0);
    setError("");
    onUploadReset?.();

    try {
      const uploadId = await uploadFile(file, fileType, setProgress);
      setStatus("complete");
      onUploadComplete?.(uploadId);
    } catch (err) {
      setStatus("error");
      setError(typeof err.message === "string" ? err.message : "העלאה נכשלה");
      onUploadReset?.();
    }
  }

  return (
    <div className={compact ? "" : "sm:col-span-2"}>
      {label && (
        <span className="block text-sm font-medium text-gray-700">{label}</span>
      )}
      <div className={`${label ? "mt-2" : ""} flex flex-wrap items-center gap-3`}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {status === "uploading" ? "מעלה..." : "בחר קובץ"}
        </button>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />
        {fileName && status === "complete" && (
          <span className="flex items-center gap-2 text-sm text-gray-700">
            <CheckIcon />
            <span dir="ltr">{fileName}</span>
          </span>
        )}
        {fileName && status === "uploading" && (
          <span className="text-sm text-gray-500" dir="ltr">{fileName}</span>
        )}
      </div>

      {status === "uploading" && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">{progress}%</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
