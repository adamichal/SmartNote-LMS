import asyncio
import json
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from backend.models.schemas import (
    ExportRequest,
    JobStatusResponse,
    LectureSourcesResponse,
    NotebookResponse,
    NotebookUpdate,
)
from backend.services import export as export_service, job_status, notebook, pipeline_runner
from backend.services.filesystem import get_lecture_path, get_lecture_sources

router = APIRouter(prefix="/api/courses/{course_name}/lectures", tags=["lectures"])


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


@router.get("/{lecture_id}/sources", response_model=LectureSourcesResponse)
async def list_lecture_sources(course_name: str, lecture_id: str):
    return get_lecture_sources(course_name, lecture_id)


@router.get("/{lecture_id}/status", response_model=JobStatusResponse)
async def get_lecture_status(course_name: str, lecture_id: str):
    return job_status.get_lecture_status(course_name, lecture_id)


@router.post("/{lecture_id}/retry", response_model=JobStatusResponse)
async def retry_lecture(course_name: str, lecture_id: str, background_tasks: BackgroundTasks):
    lecture_path = get_lecture_path(course_name, lecture_id)
    background_tasks.add_task(pipeline_runner.submit_retry, lecture_path)
    return job_status.get_lecture_status(course_name, lecture_id)


@router.post("/{lecture_id}/retry-ai", response_model=JobStatusResponse)
async def retry_lecture_ai_only(course_name: str, lecture_id: str, background_tasks: BackgroundTasks):
    lecture_path = get_lecture_path(course_name, lecture_id)
    background_tasks.add_task(pipeline_runner.submit_ai_only, lecture_path)
    return job_status.get_lecture_status(course_name, lecture_id)


@router.get("/{lecture_id}/status/stream")
async def stream_lecture_status(course_name: str, lecture_id: str):
    async def event_generator():
        while True:
            try:
                data = job_status.get_lecture_status(course_name, lecture_id)
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                if data["status"] in ("completed", "error"):
                    break
            except Exception as exc:
                yield f"data: {json.dumps({'stream_error': str(exc)}, ensure_ascii=False)}\n\n"
                break
            await asyncio.sleep(0.8)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{lecture_id}/notebook", response_model=NotebookResponse)
async def get_notebook(course_name: str, lecture_id: str):
    lecture_path = get_lecture_path(course_name, lecture_id)
    try:
        content = notebook.read_notebook(lecture_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"content": content}


@router.put("/{lecture_id}/notebook", response_model=NotebookResponse)
async def save_notebook(course_name: str, lecture_id: str, body: NotebookUpdate):
    lecture_path = get_lecture_path(course_name, lecture_id)
    notebook.save_notebook(lecture_path, body.content)
    return {"content": body.content}


@router.get("/{lecture_id}/exam-summary", response_model=NotebookResponse)
async def get_exam_summary(course_name: str, lecture_id: str):
    lecture_path = get_lecture_path(course_name, lecture_id)
    try:
        from backend.services.exam_summary import read_exam_summary

        content = read_exam_summary(lecture_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"content": content}


@router.post("/{lecture_id}/exam-summary/generate", response_model=NotebookResponse)
async def generate_exam_summary_endpoint(course_name: str, lecture_id: str):
    lecture_path = get_lecture_path(course_name, lecture_id)
    try:
        notebook_content = notebook.read_notebook(lecture_path)
        from backend.services.exam_summary import refresh_exam_summary

        refresh_exam_summary(lecture_path, notebook_content)
        from backend.services.exam_summary import read_exam_summary

        content = read_exam_summary(lecture_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"content": content}


@router.get("/{lecture_id}/export/print", response_class=HTMLResponse)
async def print_notebook(course_name: str, lecture_id: str, autoprint: bool = False):
    lecture_path = get_lecture_path(course_name, lecture_id)
    try:
        html = export_service.build_print_html(
            lecture_path,
            course_name,
            lecture_id,
            autoprint=autoprint,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return HTMLResponse(content=html)


@router.post("/{lecture_id}/export")
async def export_notebook_file(course_name: str, lecture_id: str, body: ExportRequest):
    lecture_path = get_lecture_path(course_name, lecture_id)
    try:
        output_path, media_type, filename = await asyncio.to_thread(
            lambda: export_service.export_notebook(
                lecture_path,
                body.format,
                course_name=course_name,
                lecture_id=lecture_id,
            )
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(
        output_path,
        media_type=media_type,
        filename=filename,
    )


@router.get("/{lecture_id}/images/{filename}")
async def get_lecture_image(course_name: str, lecture_id: str, filename: str):
    lecture_path = get_lecture_path(course_name, lecture_id)
    image_path = _safe_image_path(lecture_path, filename)
    return FileResponse(image_path)
