import FileUploadInput from "./FileUploadInput";

export default function MultiUploadSlots({
  title,
  hint,
  addLabel,
  slotLabel,
  uploads,
  onChange,
  fileType,
  accept,
  emptyHint,
}) {
  function addSlot() {
    onChange([...uploads, null]);
  }

  function setUploadId(index, uploadId) {
    const next = [...uploads];
    next[index] = uploadId;
    onChange(next);
  }

  function resetUpload(index) {
    const next = [...uploads];
    next[index] = null;
    onChange(next);
  }

  function removeSlot(index) {
    onChange(uploads.filter((_, slotIndex) => slotIndex !== index));
  }

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <span className="block text-sm font-medium text-gray-700">{title}</span>
        <button
          type="button"
          onClick={addSlot}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {addLabel}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {uploads.length === 0 && emptyHint && (
        <p className="mt-2 text-xs text-gray-500">{emptyHint}</p>
      )}
      <div className="mt-3 space-y-3">
        {uploads.map((uploadId, index) => (
          <div key={index} className="rounded-lg border border-gray-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">
                {slotLabel(index)}
              </span>
              <button
                type="button"
                onClick={() => removeSlot(index)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                הסר
              </button>
            </div>
            <FileUploadInput
              id={`${fileType}-${index}`}
              label=""
              accept={accept}
              fileType={fileType}
              compact
              onUploadComplete={(id) => setUploadId(index, id)}
              onUploadReset={() => resetUpload(index)}
            />
            {uploadId && (
              <p className="mt-1 text-xs text-green-600">הקובץ הועלה בהצלחה</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
