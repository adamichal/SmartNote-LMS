from pathlib import Path

from fastapi import APIRouter, BackgroundTasks

from backend.models.schemas import CourseCreate, CourseResponse, LectureCreate, LectureResponse
from backend.services import filesystem as fs, pipeline_runner

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseResponse])
async def list_courses():
    return fs.list_courses()


@router.post("", response_model=CourseResponse, status_code=201)
async def create_course(body: CourseCreate):
    return fs.create_course(body.name)


@router.delete("/{course_name}", status_code=204)
async def delete_course(course_name: str):
    fs.delete_course(course_name)


@router.get("/{course_name}/lectures", response_model=list[LectureResponse])
async def list_lectures(course_name: str):
    return fs.list_lectures(course_name)


@router.post("/{course_name}/lectures", response_model=LectureResponse, status_code=201)
async def create_lecture(
    course_name: str,
    body: LectureCreate,
    background_tasks: BackgroundTasks,
):
    result = fs.create_lecture(
        course_name,
        body.number,
        body.topic,
        media_upload_id=body.media_upload_id,
        pdf_upload_id=body.pdf_upload_id,
        transcript_upload_id=body.transcript_upload_id,
        pdf_extra_upload_ids=body.pdf_extra_upload_ids,
        media_path=body.media_path,
        pdf_path=body.pdf_path,
    )
    background_tasks.add_task(
        pipeline_runner.submit_pipeline,
        Path(result.pop("lecture_path")),
    )
    return result


@router.delete("/{course_name}/lectures/{lecture_id}", status_code=204)
async def delete_lecture(course_name: str, lecture_id: str):
    fs.delete_lecture(course_name, lecture_id)
