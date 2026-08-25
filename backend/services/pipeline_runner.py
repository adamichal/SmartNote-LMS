import concurrent.futures
from pathlib import Path

from backend.services.pipeline import run_pipeline, retry_pipeline, run_ai_only_pipeline

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3, thread_name_prefix="pipeline")

_AI_ONLY_SKIPPED = ["audio_extraction", "transcribing", "pdf_processing"]


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


def submit_pipeline(lecture_path: Path) -> None:
    _executor.submit(run_pipeline, lecture_path)


def submit_retry(lecture_path: Path) -> None:
    _executor.submit(retry_pipeline, lecture_path)


def submit_ai_only(lecture_path) -> None:
    _executor.submit(run_ai_only_pipeline, lecture_path)


def submit_course_ai_retry(course_name: str) -> int:
    """Queue AI-only reprocess for every lecture in a course. Returns lecture count."""
    from backend.services.filesystem import get_course_path_or_404, list_lectures

    course_path = get_course_path_or_404(course_name)
    lectures = list_lectures(course_name)
    for lecture in lectures:
        lecture_path = course_path / lecture["id"]
        _mark_lecture_queued_for_ai_retry(lecture_path)
        _executor.submit(run_ai_only_pipeline, lecture_path)
    return len(lectures)
