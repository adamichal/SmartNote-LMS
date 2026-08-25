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
    pdf_upload_ids: list[str] = Field(default_factory=list)
    transcript_upload_id: str | None = None
    transcript_upload_ids: list[str] = Field(default_factory=list)
    pdf_extra_upload_ids: list[str] = Field(default_factory=list)
    extra_material_upload_ids: list[str] = Field(default_factory=list)
    transcript_text: str | None = None
    media_path: str | None = None
    pdf_path: str | None = None


class LectureSourceItem(BaseModel):
    category: str
    filename: str
    original_name: str
    extension: str
    size_bytes: int


class LectureSourcesResponse(BaseModel):
    items: list[LectureSourceItem]
    summary: dict[str, int] = Field(default_factory=dict)


class LectureResponse(BaseModel):
    id: str
    number: int
    topic: str
    status: str


class BulkAiRetryResponse(BaseModel):
    course_name: str
    queued: int


class UploadInitRequest(BaseModel):
    filename: str = Field(min_length=1)
    file_type: str = Field(
        pattern="^(media|pdf|transcript|pdf_extra|lecture_extra|course_material)$"
    )
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
    has_notebook: bool = False
    skipped_stages: list[str] = Field(default_factory=list)


class NotebookResponse(BaseModel):
    content: str


class NotebookUpdate(BaseModel):
    content: str = Field(min_length=1)


class ExportRequest(BaseModel):
    format: str = Field(pattern="^(md|pdf|docx)$")


class CourseMaterialResponse(BaseModel):
    filename: str
    size_bytes: int
    extension: str


class CourseMaterialAdd(BaseModel):
    upload_id: str = Field(min_length=1)


class CourseInfoUpdate(BaseModel):
    content: str = ""


class CourseInfoResponse(BaseModel):
    content: str


class CourseContextPreview(BaseModel):
    content: str
    char_count: int
    max_chars: int
