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

export function createLecture(courseName, number, topic, { mediaUploadId, pdfUploadId } = {}) {
  return request(`/courses/${encodeURIComponent(courseName)}/lectures`, {
    method: "POST",
    body: JSON.stringify({
      number,
      topic,
      media_upload_id: mediaUploadId,
      pdf_upload_id: pdfUploadId,
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
