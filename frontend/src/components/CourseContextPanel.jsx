import { useCallback, useEffect, useState } from "react";
import {
  addCourseMaterial,
  deleteCourseMaterial,
  getCourseInfo,
  getCourseMaterials,
  updateCourseInfo,
} from "../api/client";
import ConfirmDialog from "./ConfirmDialog";
import FileUploadInput from "./FileUploadInput";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CourseContextPanel({ courseName }) {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState("");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [materialToDelete, setMaterialToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [infoData, materialsData] = await Promise.all([
        getCourseInfo(courseName),
        getCourseMaterials(courseName),
      ]);
      setInfo(infoData.content || "");
      setMaterials(materialsData);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "טעינת נתוני הקורס נכשלה");
    } finally {
      setLoading(false);
    }
  }, [courseName]);

  useEffect(() => {
    if (expanded) {
      loadData();
    }
  }, [expanded, loadData]);

  async function handleSaveInfo() {
    setSaving(true);
    setError("");
    setSaveMessage("");
    try {
      await updateCourseInfo(courseName, info);
      setSaveMessage("התיאור נשמר");
      setTimeout(() => setSaveMessage(""), 2500);
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "שמירת התיאור נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function handleMaterialUploaded(uploadId) {
    setError("");
    await addCourseMaterial(courseName, uploadId);
  }

  async function handleConfirmDeleteMaterial() {
    if (!materialToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteCourseMaterial(courseName, materialToDelete);
      setMaterialToDelete(null);
      await loadData();
    } catch (err) {
      setError(typeof err.message === "string" ? err.message : "מחיקת החומר נכשלה");
    } finally {
      setDeleting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        ⚙️ הקשר קורס (תיאור + חומרים משותפים)
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">הקשר קורס</h2>
          <p className="mt-1 text-sm text-slate-500">
            תיאור הקורס וחומרים משותפים משפרים את דיוק המחברות בכל ההרצאות.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          סגור
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">טוען...</p>}
      {error && <p className="flash-message flash-message--error">{error}</p>}

      {!loading && (
        <div className="space-y-6">
          <div>
            <label htmlFor="course-info" className="block text-sm font-medium text-slate-700">
              תיאור הקורס
            </label>
            <textarea
              id="course-info"
              rows={4}
              value={info}
              onChange={(event) => setInfo(event.target.value)}
              placeholder="מטרות הקורס, קהל יעד, מושגי יסוד, סילבוס כללי..."
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveInfo}
                disabled={saving}
                className="btn-primary text-sm"
              >
                {saving ? "שומר..." : "שמור תיאור"}
              </button>
              {saveMessage && <span className="text-sm text-green-600">{saveMessage}</span>}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">חומרים משותפים (PDF, TXT, MD)</p>
            <p className="mt-1 text-xs text-slate-500">
              סילבוס, מאמרים, מילון מונחים — ניתן לבחור מספר קבצים בבת אחת.
            </p>
            <div className="mt-3">
              <FileUploadInput
                id="course-material-upload"
                label=""
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                fileType="course_material"
                compact
                multiple
                onUploadComplete={handleMaterialUploaded}
                onAllUploadsComplete={loadData}
              />
            </div>

            {materials.length > 0 && (
              <ul className="mt-4 space-y-2">
                {materials.map((material) => (
                  <li
                    key={material.filename}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <span className="text-sm text-slate-800" dir="ltr">
                      {material.filename}{" "}
                      <span className="text-slate-400">({formatFileSize(material.size_bytes)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMaterialToDelete(material.filename)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      מחק
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {materialToDelete && (
        <ConfirmDialog
          title="מחיקת חומר"
          message={`האם למחוק את ${materialToDelete}?`}
          confirmLabel="מחק"
          loading={deleting}
          onConfirm={handleConfirmDeleteMaterial}
          onCancel={() => setMaterialToDelete(null)}
        />
      )}
    </div>
  );
}
