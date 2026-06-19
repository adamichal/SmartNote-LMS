import concurrent.futures
from pathlib import Path

from backend.services.pipeline import run_pipeline, retry_pipeline

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=3, thread_name_prefix="pipeline")


def submit_pipeline(lecture_path: Path) -> None:
    _executor.submit(run_pipeline, lecture_path)


def submit_retry(lecture_path: Path) -> None:
    _executor.submit(retry_pipeline, lecture_path)
