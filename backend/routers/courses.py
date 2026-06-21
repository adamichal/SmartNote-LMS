from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.config import COURSE_CONTEXT_MAX_CHARS
from backend.models.schemas import (
    CourseContextPreview,
    CourseCreate,
    CourseInfoResponse,
    CourseInfoUpdate,
    CourseMaterialAdd,
    CourseMaterialResponse,
    CourseResponse,
    LectureCreate,
    LectureResponse,
)
from backend.services import course_context, filesystem as fs, pipeline_runner
from backend.services.filesystem import parse_lecture_folder

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


@router.get("/{course_name}/materials", response_model=list[CourseMaterialResponse])
async def list_course_materials(course_name: str):
    return course_context.list_course_materials(course_name)


@router.post("/{course_name}/materials", response_model=CourseMaterialResponse, status_code=201)
async def add_course_material(course_name: str, body: CourseMaterialAdd):
    return course_context.add_course_material_file(course_name, body.upload_id)


@router.delete("/{course_name}/materials/{filename}", status_code=204)
async def delete_course_material(course_name: str, filename: str):
    course_context.delete_course_material(course_name, filename)


@router.get("/{course_name}/info", response_model=CourseInfoResponse)
async def get_course_info(course_name: str):
    return {"content": course_context.read_course_info(course_name)}


@router.put("/{course_name}/info", response_model=CourseInfoResponse)
async def update_course_info(course_name: str, body: CourseInfoUpdate):
    course_context.write_course_info(course_name, body.content)
    return {"content": body.content}


@router.get("/{course_name}/context-preview", response_model=CourseContextPreview)
async def preview_course_context(course_name: str, lecture_id: str | None = None):
    course_path = fs.get_course_path_or_404(course_name)
    if lecture_id:
        if not parse_lecture_folder(lecture_id):
            raise HTTPException(status_code=400, detail="Invalid lecture id")
        lecture_path = course_path / lecture_id
        if not lecture_path.is_dir():
            raise HTTPException(status_code=404, detail="Lecture not found")
    else:
        lectures = fs.list_lectures(course_name)
        if not lectures:
            return CourseContextPreview(
                content="",
                char_count=0,
                max_chars=COURSE_CONTEXT_MAX_CHARS,
            )
        lecture_path = course_path / lectures[-1]["id"]

    content = course_context.build_course_context_for_lecture(lecture_path)
    return CourseContextPreview(
        content=content,
        char_count=len(content),
        max_chars=COURSE_CONTEXT_MAX_CHARS,
    )
