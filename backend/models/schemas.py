from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CourseResponse(BaseModel):
    name: str
    lecture_count: int


class LectureCreate(BaseModel):
    number: int = Field(ge=1, le=999)
    topic: str = Field(min_length=1, max_length=200)


class LectureResponse(BaseModel):
    id: str
    number: int
    topic: str
    status: str
