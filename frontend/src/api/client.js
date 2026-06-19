const API_BASE = "/api";

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

export function getLectures(courseName) {
  return request(`/courses/${encodeURIComponent(courseName)}/lectures`);
}

export function createLecture(courseName, number, topic, { mediaPath = null, pdfPath = null } = {}) {
  const body = { number, topic };
  if (mediaPath) body.media_path = mediaPath;
  if (pdfPath) body.pdf_path = pdfPath;

  return request(`/courses/${encodeURIComponent(courseName)}/lectures`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function validateFilePath(path, fileType) {
  return request("/files/validate", {
    method: "POST",
    body: JSON.stringify({ path, file_type: fileType }),
  });
}
