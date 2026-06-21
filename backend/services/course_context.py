import hashlib
import re
from pathlib import Path

import fitz
from fastapi import HTTPException

from backend.config import COURSE_CONTEXT_MAX_CHARS
from backend.services.filesystem import get_course_path_or_404, list_lectures, parse_lecture_folder

COURSE_MATERIALS_DIR = "course_materials"
COURSE_INFO_FILENAME = "course_info.md"
TEXT_CACHE_DIR = ".text_cache"
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


def _course_materials_path(course_path: Path) -> Path:
    return course_path / COURSE_MATERIALS_DIR


def ensure_course_materials_dir(course_path: Path) -> Path:
    materials_dir = _course_materials_path(course_path)
    materials_dir.mkdir(parents=True, exist_ok=True)
    (materials_dir / TEXT_CACHE_DIR).mkdir(exist_ok=True)
    info_path = course_path / COURSE_INFO_FILENAME
    if not info_path.exists():
        info_path.write_text("", encoding="utf-8")
    return materials_dir


def list_course_materials(course_name: str) -> list[dict]:
    course_path = get_course_path_or_404(course_name)
    materials_dir = _course_materials_path(course_path)
    if not materials_dir.exists():
        return []

    results = []
    for entry in sorted(materials_dir.iterdir()):
        if not entry.is_file():
            continue
        extension = entry.suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            continue
        stat = entry.stat()
        results.append(
            {
                "filename": entry.name,
                "size_bytes": stat.st_size,
                "extension": extension,
            }
        )
    return results


def read_course_info(course_name: str) -> str:
    course_path = get_course_path_or_404(course_name)
    info_path = course_path / COURSE_INFO_FILENAME
    if not info_path.exists():
        return ""
    return info_path.read_text(encoding="utf-8")


def write_course_info(course_name: str, content: str) -> None:
    course_path = get_course_path_or_404(course_name)
    ensure_course_materials_dir(course_path)
    (course_path / COURSE_INFO_FILENAME).write_text(content, encoding="utf-8")


def _sanitize_material_filename(filename: str) -> str:
    safe_name = Path(filename).name
    if not safe_name or safe_name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if ".." in safe_name or "/" in safe_name or "\\" in safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return safe_name


def delete_course_material(course_name: str, filename: str) -> None:
    course_path = get_course_path_or_404(course_name)
    safe_name = _sanitize_material_filename(filename)
    file_path = _course_materials_path(course_path) / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Material not found")
    file_path.unlink()
    _invalidate_cache_for_file(course_path, safe_name)


def add_course_material_file(course_name: str, upload_id: str) -> dict:
    from backend.services import uploads as upload_service

    course_path = get_course_path_or_404(course_name)
    ensure_course_materials_dir(course_path)
    dest_path = upload_service.finalize_upload_to_course_materials(upload_id, course_path)
    _invalidate_cache_for_file(course_path, dest_path.name)
    stat = dest_path.stat()
    return {
        "filename": dest_path.name,
        "size_bytes": stat.st_size,
        "extension": dest_path.suffix.lower(),
    }


def _cache_key(file_path: Path) -> str:
    stat = file_path.stat()
    raw = f"{file_path.name}:{stat.st_mtime_ns}:{stat.st_size}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _cache_path(course_path: Path, file_path: Path) -> Path:
    return _course_materials_path(course_path) / TEXT_CACHE_DIR / f"{file_path.stem}_{_cache_key(file_path)}.txt"


def _invalidate_cache_for_file(course_path: Path, filename: str) -> None:
    cache_dir = _course_materials_path(course_path) / TEXT_CACHE_DIR
    if not cache_dir.exists():
        return
    stem = Path(filename).stem
    for cached in cache_dir.glob(f"{stem}_*.txt"):
        cached.unlink(missing_ok=True)


def _extract_pdf_text(pdf_path: Path) -> str:
    doc = fitz.open(pdf_path)
    try:
        parts = []
        for page_num, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                parts.append(f"--- page {page_num + 1} ---\n{text}")
        return "\n\n".join(parts)
    finally:
        doc.close()


def extract_material_text(course_path: Path, file_path: Path) -> str:
    extension = file_path.suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        return ""

    cache = _cache_path(course_path, file_path)
    if cache.exists():
        return cache.read_text(encoding="utf-8")

    if extension == ".pdf":
        text = _extract_pdf_text(file_path)
    else:
        text = file_path.read_text(encoding="utf-8")

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(text, encoding="utf-8")
    return text


def _extract_summary_from_notebook(notebook_path: Path) -> str | None:
    if not notebook_path.exists():
        return None
    content = notebook_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"^##\s*סיכום מהיר\s*\n(.*?)(?=\n## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(content)
    if not match:
        return None
    return match.group(1).strip()


def _build_lecture_outline(course_name: str) -> str:
    lectures = list_lectures(course_name)
    lines = ["# מבנה הקורס"]
    for lecture in lectures:
        lines.append(f"- הרצאה {lecture['number']}: {lecture['topic']}")
    return "\n".join(lines)


def _build_prior_summaries(course_path: Path, current_number: int) -> str:
    lines = ["# סיכומים מהרצאות קודמות"]
    found_any = False
    for entry in sorted(course_path.iterdir()):
        if not entry.is_dir():
            continue
        parsed = parse_lecture_folder(entry.name)
        if not parsed:
            continue
        number, topic = parsed
        if number >= current_number:
            continue
        summary = _extract_summary_from_notebook(entry / "final_notebook.md")
        if summary:
            found_any = True
            lines.append(f"\n## הרצאה {number}: {topic}\n{summary}")
    if not found_any:
        lines.append("(אין סיכומים מהרצאות קודמות עדיין)")
    return "\n".join(lines)


def _build_shared_materials(course_path: Path) -> str:
    materials_dir = _course_materials_path(course_path)
    if not materials_dir.exists():
        return ""

    lines = ["# חומרים משותפים לקורס"]
    found_any = False
    for entry in sorted(materials_dir.iterdir()):
        if not entry.is_file() or entry.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        found_any = True
        text = extract_material_text(course_path, entry)
        if text.strip():
            lines.append(f"\n## {entry.name}\n{text}")
    if not found_any:
        return ""
    return "\n".join(lines)


def _truncate_context(sections: list[tuple[str, int]], max_chars: int) -> str:
    result_parts: list[str] = []
    total = 0

    for section_text, _priority in sections:
        if not section_text.strip():
            continue
        remaining = max_chars - total
        if remaining <= 0:
            break
        if len(section_text) <= remaining:
            result_parts.append(section_text)
            total += len(section_text) + 2
        else:
            truncated = section_text[: remaining - 50]
            last_para = truncated.rfind("\n\n")
            if last_para > remaining // 2:
                truncated = truncated[:last_para]
            truncated += "\n\n[... truncated for length ...]"
            result_parts.append(truncated)
            break

    return "\n\n".join(result_parts)


def build_course_context_for_lecture(lecture_path: Path) -> str:
    course_path = lecture_path.parent
    course_name = course_path.name
    parsed = parse_lecture_folder(lecture_path.name)
    if not parsed:
        return ""
    current_number, _topic = parsed

    course_info = read_course_info(course_name)
    course_info_section = (
        f"# תיאור הקורס\n{course_info.strip()}" if course_info.strip() else ""
    )
    outline = _build_lecture_outline(course_name)
    prior_summaries = _build_prior_summaries(course_path, current_number)
    shared_materials = _build_shared_materials(course_path)

    sections = [
        (course_info_section, 0),
        (outline, 1),
        (prior_summaries, 2),
        (shared_materials, 3),
    ]
    return _truncate_context(sections, COURSE_CONTEXT_MAX_CHARS)
