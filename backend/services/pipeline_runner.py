import concurrent.futures
import threading
from pathlib import Path

from backend.services.pipeline import run_pipeline, retry_pipeline, run_ai_only_pipeline

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3, thread_name_prefix="pipeline")

_AI_ONLY_SKIPPED = ["audio_extraction", "transcribing", "pdf_processing"]

# lectures that are queued or running right now, so the same lecture never runs twice at once
_active: set[str] = set()
_active_lock = threading.Lock()


def _key(lecture_path: Path) -> str:
    return str(Path(lecture_path).resolve())


def is_lecture_busy(lecture_path: Path) -> bool:
    with _active_lock:
        return _key(lecture_path) in _active


def _submit_once(job, lecture_path: Path) -> bool:
    """Queue the job unless this lecture already has one. Returns False if it was skipped."""
    key = _key(lecture_path)
    with _active_lock:
        if key in _active:
            return False
        _active.add(key)

    def run():
        try:
            job(lecture_path)
        finally:
            with _active_lock:
                _active.discard(key)

    _executor.submit(run)
    return True


def _mark_lecture_queued_for_ai_retry(lecture_path: Path) -> None:
    from backend.services.job_status import read_job_status, write_job_status

    try:
        existing = read_job_status(lecture_path)
        skipped = existing.get("skipped_stages") or _AI_ONLY_SKIPPED
    except FileNotFoundError:
        skipped = _AI_ONLY_SKIPPED

    write_job_status(
        lecture_path,
        status="pending",
        stage="ai_retry_queued",
        progress_pct=0,
        error=None,
        completed_at=None,
        skipped_stages=skipped,
    )


def submit_pipeline(lecture_path: Path) -> bool:
    return _submit_once(run_pipeline, lecture_path)


def submit_retry(lecture_path: Path) -> bool:
    return _submit_once(retry_pipeline, lecture_path)


def submit_ai_only(lecture_path: Path) -> bool:
    return _submit_once(run_ai_only_pipeline, lecture_path)


def submit_course_ai_retry(course_name: str) -> int:
    """Queue AI-only reprocess for every lecture in a course. Returns how many were queued
    (lectures that are already running are skipped)."""
    from backend.services.filesystem import get_course_path_or_404, list_lectures

    course_path = get_course_path_or_404(course_name)
    lectures = list_lectures(course_name)
    queued = 0
    for lecture in lectures:
        lecture_path = course_path / lecture["id"]
        if is_lecture_busy(lecture_path):
            continue
        _mark_lecture_queued_for_ai_retry(lecture_path)
        if _submit_once(run_ai_only_pipeline, lecture_path):
            queued += 1
    return queued
