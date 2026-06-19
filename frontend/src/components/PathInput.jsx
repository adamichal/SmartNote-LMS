import { useEffect, useState } from "react";
import { validateFilePath } from "../api/client";

function ValidationIcon({ status }) {
  if (status === "validating") {
    return (
      <span className="flex h-5 w-5 items-center justify-center text-gray-400" title="בודק...">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </span>
    );
  }

  if (status === "valid") {
    return (
      <span className="flex h-5 w-5 items-center justify-center text-green-600" title="תקין">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }

  if (status === "invalid") {
    return (
      <span className="flex h-5 w-5 items-center justify-center text-red-600" title="לא תקין">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }

  return null;
}

export default function PathInput({ id, label, placeholder, fileType, value, onChange, onValidationChange }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus("idle");
      setMessage("");
      onValidationChange?.(null);
      return;
    }

    setStatus("validating");
    const timer = setTimeout(async () => {
      try {
        const result = await validateFilePath(trimmed, fileType);
        if (result.valid) {
          setStatus("valid");
          setMessage("");
          onValidationChange?.(true);
        } else {
          setStatus("invalid");
          setMessage(result.message);
          onValidationChange?.(false);
        }
      } catch {
        setStatus("invalid");
        setMessage("שגיאה בבדיקת הנתיב");
        onValidationChange?.(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [value, fileType, onValidationChange]);

  const borderClass =
    status === "valid"
      ? "border-green-400 focus:border-green-500 focus:ring-green-500"
      : status === "invalid"
        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500";

  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="text"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border px-3 py-2 pe-10 focus:outline-none focus:ring-1 ${borderClass}`}
          placeholder={placeholder}
        />
        <div className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
          <ValidationIcon status={status} />
        </div>
      </div>
      {message && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </div>
  );
}
