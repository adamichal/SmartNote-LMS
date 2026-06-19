from fastapi import APIRouter

from backend.models.schemas import CourseCreate, CourseResponse, LectureCreate, LectureResponse
from backend.services import filesystem as fs

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseResponse])
async def list_courses():
    return fs.list_courses()


@router.post("", response_model=CourseResponse, status_code=201)
async def create_course(body: CourseCreate):
    return fs.create_course(body.name)


@router.get("/{course_name}/lectures", response_model=list[LectureResponse])
async def list_lectures(course_name: str):
    return fs.list_lectures(course_name)


@router.post("/{course_name}/lectures", response_model=LectureResponse, status_code=201)
async def create_lecture(course_name: str, body: LectureCreate):
    return fs.create_lecture(
        course_name,
        body.number,
        body.topic,
        media_path=body.media_path,
        pdf_path=body.pdf_path,
    )
