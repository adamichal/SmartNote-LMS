import FileUploadInput from "./FileUploadInput";

export default function PresentationBulkUpload({ uploadIds, onChange }) {
  function addUploadId(uploadId) {
    onChange([...uploadIds, uploadId]);
  }

  function removeUpload(index) {
    onChange(uploadIds.filter((_, slotIndex) => slotIndex !== index));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="sm:col-span-2">
      <span className="block text-sm font-medium text-gray-700">מצגות (PDF) — אופציונלי</span>
      <p className="mt-1 text-xs text-gray-500">
        ניתן לבחור כמה מצגות בבת אחת. כולן יעובדו כמקור ראשי להרצאה.
      </p>

      <div className="mt-3">
        <FileUploadInput
          id="presentation-files"
          label=""
          accept=".pdf,application/pdf"
          fileType="pdf"
          multiple
          onUploadComplete={addUploadId}
        />
      </div>

      {uploadIds.length > 0 && (
        <div className="mt-3 rounded-lg border border-gray-100 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-gray-600">
              {uploadIds.length} מצגות מוכנות לעיבוד
            </span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-red-600 hover:text-red-800"
            >
              נקה הכל
            </button>
          </div>
          <ul className="space-y-1">
            {uploadIds.map((uploadId, index) => (
              <li
                key={uploadId}
                className="flex items-center justify-between gap-3 text-sm text-gray-700"
              >
                <span>מצגת {index + 1}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-green-600">הועלה</span>
                  <button
                    type="button"
                    onClick={() => removeUpload(index)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    הסר
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploadIds.length === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          העלה מצגת אחת או יותר — גם בלי מדיה או תמלול.
        </p>
      )}
    </div>
  );
}
