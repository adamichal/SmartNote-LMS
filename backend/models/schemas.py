from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CourseResponse(BaseModel):
    name: str
    lecture_count: int


class LectureCreate(BaseModel):
    number: int = Field(ge=1, le=999)
    topic: str = Field(min_length=1, max_length=200)
    media_upload_id: str | None = None
    pdf_upload_id: str | None = None
    media_path: str | None = None
    pdf_path: str | None = None


class LectureResponse(BaseModel):
    id: str
    number: int
    topic: str
    status: str


class UploadInitRequest(BaseModel):
    filename: str = Field(min_length=1)
    file_type: str = Field(pattern="^(media|pdf)$")
    total_size: int = Field(gt=0)


class UploadInitResponse(BaseModel):
    upload_id: str
    chunk_size: int


class UploadChunkResponse(BaseModel):
    upload_id: str
    received: int
    total_size: int
    complete: bool
    progress_pct: int


class FileValidateRequest(BaseModel):
    path: str = Field(min_length=1)
    file_type: str = Field(pattern="^(media|pdf)$")


class FileValidateResponse(BaseModel):
    valid: bool
    message: str
    filename: str
    extension: str


class JobStatusResponse(BaseModel):
    id: str
    course_name: str
    number: int
    topic: str
    job_id: str
    status: str
    stage: str | None
    progress_pct: int
    error: str | None
    created_at: str
    completed_at: str | None
