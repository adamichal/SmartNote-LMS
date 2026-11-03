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


INTERRUPTED_ERROR = "העיבוד נקטע (השרת הופעל מחדש) — אפשר לנסות שוב"


def _recover_lecture(lecture_path: Path) -> str | None:
    """Fix one lecture left in processing/pending by a stopped server. Returns what was done."""
    from backend.services.notebook_backup import (
        latest_backup_with_notebook,
        restore_backup,
    )

    try:
        status = read_job_status(lecture_path)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    if status.get("status") not in ("processing", "pending"):
        return None

    now = datetime.now(timezone.utc).isoformat()
    has_notebook = (lecture_path / "final_notebook.md").is_file()

    # notebook is gone (reprocess was cut off) but we still have the old one
    if not has_notebook:
        backup_dir = latest_backup_with_notebook(lecture_path)
        if backup_dir:
            restore_backup(lecture_path, backup_dir)
            log_pipeline(lecture_path, f"Startup: restored notebook from backup/{backup_dir.name}")
            write_job_status(
                lecture_path, status="completed", progress_pct=100, error=None,
                completed_at=status.get("completed_at") or now,
            )
            return "restored from backup"

    # the job had already finished once, only the status was left behind,
    # or it was queued ("pending") and never started, so the old notebook is untouched
    if has_notebook and (status.get("completed_at") or status.get("status") == "pending"):
        log_pipeline(lecture_path, f"Startup: status was stuck ({status.get('status')}), notebook exists — marked completed")
        write_job_status(
            lecture_path, status="completed", progress_pct=100, error=None,
            completed_at=status.get("completed_at") or now,
        )
        return "marked completed"

    log_pipeline(lecture_path, "Startup: job was interrupted — marked as error")
    write_job_status(lecture_path, status="error", error=INTERRUPTED_ERROR)
    return "marked error"


def recover_interrupted_jobs(courses_root: Path) -> list[str]:
    """On startup no job can be running yet, so any processing/pending status is left over."""
    results = []
    if not courses_root.is_dir():
        return results
    for course in sorted(courses_root.iterdir()):
        if not course.is_dir():
            continue
        for lecture in sorted(course.iterdir()):
            if not lecture.is_dir() or not parse_lecture_folder(lecture.name):
                continue
            try:
                action = _recover_lecture(lecture)
            except Exception as exc:
                # one broken lecture shouldn't stop the server from starting
                action = f"recovery failed: {exc}"
            if action:
                results.append(f"{course.name}/{lecture.name}: {action}")
    return results


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
