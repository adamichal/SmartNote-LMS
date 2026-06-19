from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CourseResponse(BaseModel):
    name: str
    lecture_count: int


class LectureCreate(BaseModel):
    number: int = Field(ge=1, le=999)
    topic: str = Field(min_length=1, max_length=200)
    media_path: str | None = None
    pdf_path: str | None = None


class FileValidateRequest(BaseModel):
    path: str = Field(min_length=1)
    file_type: str = Field(pattern="^(media|pdf)$")


class FileValidateResponse(BaseModel):
    valid: bool
    message: str
    filename: str
    extension: str


class LectureResponse(BaseModel):
    id: str
    number: int
    topic: str
    status: str
