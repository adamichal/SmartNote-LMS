import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from backend.services.filesystem import get_lecture_path, parse_lecture_folder


def read_job_status(lecture_path: Path) -> dict:
    status_file = lecture_path / "job_status.json"
    if not status_file.exists():
        raise FileNotFoundError(f"Job status not found: {status_file}")
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


def get_lecture_status(course_name: str, lecture_id: str) -> dict:
    lecture_path = get_lecture_path(course_name, lecture_id)
    try:
        status = read_job_status(lecture_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    parsed = parse_lecture_folder(lecture_id)
    number, topic = parsed if parsed else (0, lecture_id)
    return {
        "id": lecture_id,
        "course_name": course_name,
        "number": number,
        "topic": topic,
        "has_notebook": (lecture_path / "final_notebook.md").exists(),
        **status,
    }
