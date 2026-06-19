import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from backend.config import COURSES_BASE_PATH

INVALID_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00]')
LECTURE_FOLDER_PATTERN = re.compile(r"^(\d{2})_(.+)$")
LECTURE_SUBDIRS = ("raw_media", "extracted_images", "transcripts")


def _ensure_courses_root() -> Path:
    COURSES_BASE_PATH.mkdir(parents=True, exist_ok=True)
    return COURSES_BASE_PATH


def sanitize_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if INVALID_NAME_CHARS.search(cleaned):
        raise HTTPException(status_code=400, detail="Name contains invalid characters")
    if cleaned in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid name")
    return cleaned


def lecture_folder_name(number: int, topic: str) -> str:
    topic_clean = topic.strip()
    if not topic_clean:
        raise HTTPException(status_code=400, detail="Topic cannot be empty")
    topic_part = re.sub(r"\s+", "_", topic_clean)
    topic_part = INVALID_NAME_CHARS.sub("", topic_part)
    if not topic_part:
        raise HTTPException(status_code=400, detail="Topic contains no valid characters")
    return f"{number:02d}_{topic_part}"


def parse_lecture_folder(folder_name: str) -> tuple[int, str] | None:
    match = LECTURE_FOLDER_PATTERN.match(folder_name)
    if not match:
        return None
    number = int(match.group(1))
    topic = match.group(2).replace("_", " ")
    return number, topic


def _course_path(course_name: str) -> Path:
    safe_name = sanitize_name(course_name)
    return _ensure_courses_root() / safe_name


def _read_lecture_status(lecture_path: Path) -> str:
    status_file = lecture_path / "job_status.json"
    if not status_file.exists():
        return "pending"
    try:
        data = json.loads(status_file.read_text(encoding="utf-8"))
        return data.get("status", "pending")
    except (json.JSONDecodeError, OSError):
        return "unknown"


def list_courses() -> list[dict]:
    root = _ensure_courses_root()
    courses = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        lecture_count = sum(
            1
            for child in entry.iterdir()
            if child.is_dir() and parse_lecture_folder(child.name)
        )
        courses.append({"name": entry.name, "lecture_count": lecture_count})
    return courses


def create_course(name: str) -> dict:
    course_path = _course_path(name)
    safe_name = course_path.name
    if course_path.exists():
        raise HTTPException(status_code=409, detail="Course already exists")
    course_path.mkdir(parents=True, exist_ok=False)
    return {"name": safe_name, "lecture_count": 0}


def get_course_path_or_404(course_name: str) -> Path:
    course_path = _course_path(course_name)
    if not course_path.is_dir():
        raise HTTPException(status_code=404, detail="Course not found")
    return course_path


def list_lectures(course_name: str) -> list[dict]:
    course_path = get_course_path_or_404(course_name)
    lectures = []
    for entry in sorted(course_path.iterdir()):
        if not entry.is_dir():
            continue
        parsed = parse_lecture_folder(entry.name)
        if not parsed:
            continue
        number, topic = parsed
        lectures.append(
            {
                "id": entry.name,
                "number": number,
                "topic": topic,
                "status": _read_lecture_status(entry),
            }
        )
    lectures.sort(key=lambda item: item["number"])
    return lectures


def create_lecture(course_name: str, number: int, topic: str) -> dict:
    course_path = get_course_path_or_404(course_name)
    folder_name = lecture_folder_name(number, topic)
    lecture_path = course_path / folder_name

    if lecture_path.exists():
        raise HTTPException(status_code=409, detail="Lecture already exists")

    lecture_path.mkdir(parents=True, exist_ok=False)
    for subdir in LECTURE_SUBDIRS:
        (lecture_path / subdir).mkdir()

    now = datetime.now(timezone.utc).isoformat()
    job_status = {
        "job_id": str(uuid.uuid4()),
        "status": "pending",
        "stage": None,
        "progress_pct": 0,
        "error": None,
        "created_at": now,
        "completed_at": None,
    }
    (lecture_path / "job_status.json").write_text(
        json.dumps(job_status, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return {
        "id": folder_name,
        "number": number,
        "topic": topic.strip(),
        "status": "pending",
    }
