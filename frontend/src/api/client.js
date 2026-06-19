const API_BASE = "/api";
const CHUNK_SIZE = 10 * 1024 * 1024;

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
  return request(
    `/courses/${encodeURIComponent(courseName)}/lectures/${encodeURIComponent(lectureId)}`,
    { method: "DELETE" },
  );
}

export function getLectures(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}/lectures`);
}

export function createLecture(
  courseName,
  number,
  topic,
  {
    mediaUploadId,
    pdfUploadId,
    transcriptUploadId,
    pdfExtraUploadIds = [],
  } = {},
) {
  return request(`/courses/${encodeURIComponent(courseName)}/lectures`, {
    method: "POST",
    body: JSON.stringify({
      number,
      topic,
      media_upload_id: mediaUploadId || null,
      pdf_upload_id: pdfUploadId || null,
      transcript_upload_id: transcriptUploadId || null,
      pdf_extra_upload_ids: pdfExtraUploadIds,
    }),
  });
}

export function getLectureStatus(lectureId) {
  return request(`/lectures/${encodeURIComponent(lectureId)}/status`);
}

export function retryLecture(lectureId) {
  return request(`/lectures/${encodeURIComponent(lectureId)}/retry`, {
    method: "POST",
  });
}

export function getNotebook(lectureId) {
  return request(`/lectures/${encodeURIComponent(lectureId)}/notebook`);
}

export function saveNotebook(lectureId, content) {
  return request(`/lectures/${encodeURIComponent(lectureId)}/notebook`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function exportNotebook(lectureId, format) {
  const response = await fetch(`${API_BASE}/lectures/${encodeURIComponent(lectureId)}/export`, {
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
