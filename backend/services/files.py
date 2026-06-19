import shutil
from pathlib import Path

from fastapi import HTTPException

MEDIA_EXTENSIONS = {".mp4", ".mp3"}
PDF_EXTENSIONS = {".pdf"}


def _resolve_path(path_str: str) -> Path:
    cleaned = path_str.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Path cannot be empty")
    try:
        return Path(cleaned).expanduser().resolve()
    except OSError as exc:
        raise HTTPException(status_code=400, detail="Invalid path") from exc


def _allowed_extensions(file_type: str) -> set[str]:
    if file_type == "media":
        return MEDIA_EXTENSIONS
    if file_type == "pdf":
        return PDF_EXTENSIONS
    raise HTTPException(status_code=400, detail="file_type must be 'media' or 'pdf'")


def validate_file_path(path_str: str, file_type: str) -> dict:
    allowed = _allowed_extensions(file_type)
    resolved = _resolve_path(path_str)
    extension = resolved.suffix.lower()

    if not resolved.exists():
        return {
            "valid": False,
            "message": "File not found",
            "filename": resolved.name,
            "extension": extension,
        }

    if not resolved.is_file():
        return {
            "valid": False,
            "message": "Path is not a file",
            "filename": resolved.name,
            "extension": extension,
        }

    if extension not in allowed:
        expected = ", ".join(sorted(allowed))
        return {
            "valid": False,
            "message": f"Invalid file type. Expected: {expected}",
            "filename": resolved.name,
            "extension": extension,
        }

    return {
        "valid": True,
        "message": "OK",
        "filename": resolved.name,
        "extension": extension,
    }


def require_valid_file(path_str: str, file_type: str) -> Path:
    result = validate_file_path(path_str, file_type)
    if not result["valid"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return _resolve_path(path_str)


def copy_media_file(source_path: Path, raw_media_dir: Path) -> None:
    extension = source_path.suffix.lower()
    dest_name = "lecture.mp4" if extension == ".mp4" else "lecture.mp3"
    shutil.copy2(source_path, raw_media_dir / dest_name)


def copy_pdf_file(source_path: Path, raw_media_dir: Path) -> None:
    shutil.copy2(source_path, raw_media_dir / "presentation.pdf")
