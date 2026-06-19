from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from backend.models.schemas import (
    ExportRequest,
    JobStatusResponse,
    NotebookResponse,
    NotebookUpdate,
)
from backend.services import export as export_service, job_status, notebook, pipeline_runner
from backend.services.job_status import find_lecture_path

router = APIRouter(prefix="/api/lectures", tags=["lectures"])


def _safe_image_path(lecture_path: Path, filename: str) -> Path:
    if not filename or filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    image_path = (lecture_path / "extracted_images" / filename).resolve()
    images_dir = (lecture_path / "extracted_images").resolve()
    if not str(image_path).startswith(str(images_dir)):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return image_path


@router.get("/{lecture_id}/status", response_model=JobStatusResponse)
async def get_lecture_status(lecture_id: str):
    return job_status.get_lecture_status(lecture_id)


@router.post("/{lecture_id}/retry", response_model=JobStatusResponse)
async def retry_lecture(lecture_id: str, background_tasks: BackgroundTasks):
    lecture_path = find_lecture_path(lecture_id)
    background_tasks.add_task(pipeline_runner.submit_retry, lecture_path)
    return job_status.get_lecture_status(lecture_id)


@router.get("/{lecture_id}/notebook", response_model=NotebookResponse)
async def get_notebook(lecture_id: str):
    lecture_path = find_lecture_path(lecture_id)
    try:
        content = notebook.read_notebook(lecture_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"content": content}


@router.put("/{lecture_id}/notebook", response_model=NotebookResponse)
async def save_notebook(lecture_id: str, body: NotebookUpdate):
    lecture_path = find_lecture_path(lecture_id)
    notebook.save_notebook(lecture_path, body.content)
    return {"content": body.content}


@router.post("/{lecture_id}/export")
async def export_notebook_file(lecture_id: str, body: ExportRequest):
    lecture_path = find_lecture_path(lecture_id)
    try:
        output_path, media_type, filename = export_service.export_notebook(
            lecture_path,
            body.format,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(
        output_path,
        media_type=media_type,
        filename=filename,
    )


@router.get("/{lecture_id}/images/{filename}")
async def get_lecture_image(lecture_id: str, filename: str):
    lecture_path = find_lecture_path(lecture_id)
    image_path = _safe_image_path(lecture_path, filename)
    return FileResponse(image_path)
