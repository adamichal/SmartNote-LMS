import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from backend.config import COURSES_BASE_PATH
from backend.services.filesystem import parse_lecture_folder


def find_lecture_path(lecture_id: str) -> Path:
    if not COURSES_BASE_PATH.exists():
        raise HTTPException(status_code=404, detail="Lecture not found")

    for course_dir in COURSES_BASE_PATH.iterdir():
        if not course_dir.is_dir():
            continue
        lecture_path = course_dir / lecture_id
        if lecture_path.is_dir() and parse_lecture_folder(lecture_id):
            return lecture_path

    raise HTTPException(status_code=404, detail="Lecture not found")


def find_course_name_for_lecture(lecture_id: str) -> str:
    for course_dir in COURSES_BASE_PATH.iterdir():
        if not course_dir.is_dir():
            continue
        lecture_path = course_dir / lecture_id
        if lecture_path.is_dir() and parse_lecture_folder(lecture_id):
            return course_dir.name
    raise HTTPException(status_code=404, detail="Lecture not found")


def read_job_status(lecture_path: Path) -> dict:
    status_file = lecture_path / "job_status.json"
    if not status_file.exists():
        raise HTTPException(status_code=404, detail="Job status not found")
    return json.loads(status_file.read_text(encoding="utf-8"))


def write_job_status(lecture_path: Path, **updates) -> dict:
    status = read_job_status(lecture_path)
    status.update(updates)
    (lecture_path / "job_status.json").write_text(
        json.dumps(status, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return status


def log_pipeline(lecture_path: Path, message: str) -> None:
    log_file = lecture_path / "pipeline.log"
    timestamp = datetime.now(timezone.utc).isoformat()
    with log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


def get_lecture_status(lecture_id: str) -> dict:
    lecture_path = find_lecture_path(lecture_id)
    status = read_job_status(lecture_path)
    parsed = parse_lecture_folder(lecture_id)
    number, topic = parsed if parsed else (0, lecture_id)
    return {
        "id": lecture_id,
        "course_name": find_course_name_for_lecture(lecture_id),
        "number": number,
        "topic": topic,
        **status,
    }
