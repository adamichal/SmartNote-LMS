const API_BASE = "/api";
const CHUNK_SIZE = 10 * 1024 * 1024;

function lecturePath(courseName, lectureId) {
  return `/courses/${encodeURIComponent(courseName)}/lectures/${encodeURIComponent(lectureId)}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    const detail = error.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(", ")
      : detail || "Request failed";
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function getCourses() {
  return request("/courses");
}

export function createCourse(name) {
  return request("/courses", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteCourse(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}`, {
    method: "DELETE",
  });
}

export function deleteLecture(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}`, { method: "DELETE" });
}

export function getLectures(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}/lectures`);
}

export function retryAllLecturesAi(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}/lectures/retry-ai-all`, {
    method: "POST",
  });
}

export function getCourseMaterials(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}/materials`);
}

export function addCourseMaterial(courseName, uploadId) {
  return request(`/courses/${encodeURIComponent(courseName)}/materials`, {
    method: "POST",
    body: JSON.stringify({ upload_id: uploadId }),
  });
}

export function deleteCourseMaterial(courseName, filename) {
  return request(
    `/courses/${encodeURIComponent(courseName)}/materials/${encodeURIComponent(filename)}`,
    { method: "DELETE" },
  );
}

export function getCourseInfo(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}/info`);
}

export function updateCourseInfo(courseName, content) {
  return request(`/courses/${encodeURIComponent(courseName)}/info`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function getCourseContextPreview(courseName, lectureId) {
  const params = lectureId ? `?lecture_id=${encodeURIComponent(lectureId)}` : "";
  return request(`/courses/${encodeURIComponent(courseName)}/context-preview${params}`);
}

export function createLecture(
  courseName,
  number,
  topic,
  {
    mediaUploadId,
    pdfUploadId,
    pdfUploadIds = [],
    transcriptUploadId,
    transcriptUploadIds = [],
    transcriptText = null,
    pdfExtraUploadIds = [],
    extraMaterialUploadIds = [],
  } = {},
) {
  const presentations = [...pdfUploadIds];
  if (pdfUploadId && !presentations.includes(pdfUploadId)) {
    presentations.unshift(pdfUploadId);
  }
  const transcripts = [...transcriptUploadIds];
  if (transcriptUploadId && !transcripts.includes(transcriptUploadId)) {
    transcripts.unshift(transcriptUploadId);
  }
  const extras = [...extraMaterialUploadIds, ...pdfExtraUploadIds];

  return request(`/courses/${encodeURIComponent(courseName)}/lectures`, {
    method: "POST",
    body: JSON.stringify({
      number,
      topic,
      media_upload_id: mediaUploadId || null,
      pdf_upload_id: null,
      pdf_upload_ids: presentations,
      transcript_upload_id: null,
      transcript_upload_ids: transcripts,
      transcript_text: transcriptText || null,
      pdf_extra_upload_ids: [],
      extra_material_upload_ids: extras,
    }),
  });
}

export function getLectureSources(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/sources`);
}

export function getLectureStatus(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/status`);
}

export function retryLecture(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/retry`, {
    method: "POST",
  });
}

export function retryLectureAiOnly(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/retry-ai`, {
    method: "POST",
  });
}

export function getNotebook(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/notebook`);
}

export function saveNotebook(courseName, lectureId, content) {
  return request(`${lecturePath(courseName, lectureId)}/notebook`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function getExamSummary(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/exam-summary`);
}

export function generateExamSummary(courseName, lectureId) {
  return request(`${lecturePath(courseName, lectureId)}/exam-summary/generate`, {
    method: "POST",
  });
}

export function openNotebookPrintView(courseName, lectureId) {
  const url = `${API_BASE}${lecturePath(courseName, lectureId)}/export/print?autoprint=1`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function exportNotebook(courseName, lectureId, format) {
  const response = await fetch(`${API_BASE}${lecturePath(courseName, lectureId)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    const detail = error.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(", ")
      : detail || "Export failed";
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] || `notebook.${format}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCourseExport(courseName, endpoint, fallbackFilename) {
  const response = await fetch(
    `${API_BASE}/courses/${encodeURIComponent(courseName)}/export/${endpoint}`,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    const detail = error.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(", ")
      : detail || "Export failed";
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] || fallbackFilename;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportCourseNotebooksZip(courseName) {
  return downloadCourseExport(courseName, "notebooks.zip", `${courseName}_notebooks.zip`);
}

export async function exportCourseNotebooksPdf(courseName) {
  return downloadCourseExport(courseName, "notebooks.pdf", `${courseName}_notebooks.pdf`);
}

export async function exportCourseExamSummariesPdf(courseName) {
  return downloadCourseExport(courseName, "exam-summaries.pdf", `${courseName}_exam_summaries.pdf`);
}

export async function uploadFile(file, fileType, onProgress) {
  const init = await request("/uploads/init", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      file_type: fileType,
      total_size: file.size,
    }),
  });

  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const end = Math.min(offset + CHUNK_SIZE, file.size) - 1;

    const response = await fetch(`${API_BASE}/uploads/${init.upload_id}/chunk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${offset}-${end}/${file.size}`,
      },
      body: chunk,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || "Upload failed");
    }

    const result = await response.json();
    onProgress?.(result.progress_pct);
    offset = result.received;
  }

  return init.upload_id;
}
