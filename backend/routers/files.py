from fastapi import APIRouter

from backend.models.schemas import FileValidateRequest, FileValidateResponse
from backend.services import files as file_service

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/validate", response_model=FileValidateResponse)
async def validate_file(body: FileValidateRequest):
    return file_service.validate_file_path(body.path, body.file_type)
