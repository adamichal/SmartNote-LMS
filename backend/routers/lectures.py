from fastapi import APIRouter, BackgroundTasks

from backend.models.schemas import JobStatusResponse
from backend.services import job_status, pipeline
from backend.services.job_status import find_lecture_path

router = APIRouter(prefix="/api/lectures", tags=["lectures"])


@router.get("/{lecture_id}/status", response_model=JobStatusResponse)
async def get_lecture_status(lecture_id: str):
    return job_status.get_lecture_status(lecture_id)


@router.post("/{lecture_id}/retry", response_model=JobStatusResponse)
async def retry_lecture(lecture_id: str, background_tasks: BackgroundTasks):
    lecture_path = find_lecture_path(lecture_id)
    background_tasks.add_task(pipeline.retry_pipeline, lecture_path)
    return job_status.get_lecture_status(lecture_id)
