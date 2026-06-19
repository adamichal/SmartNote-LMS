from fastapi import APIRouter, Header, Request

from backend.models.schemas import (
    UploadChunkResponse,
    UploadInitRequest,
    UploadInitResponse,
)
from backend.services import uploads as upload_service

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("/init", response_model=UploadInitResponse, status_code=201)
async def init_upload(body: UploadInitRequest):
    return upload_service.init_upload(body.filename, body.file_type, body.total_size)


@router.post("/{upload_id}/chunk", response_model=UploadChunkResponse)
async def upload_chunk(
    upload_id: str,
    request: Request,
    content_range: str = Header(..., alias="Content-Range"),
):
    data = await request.body()
    return upload_service.append_chunk(upload_id, content_range, data)
