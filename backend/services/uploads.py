import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from backend.config import UPLOADS_BASE_PATH
from backend.services.files import MEDIA_EXTENSIONS, PDF_EXTENSIONS

CONTENT_RANGE_PATTERN = re.compile(r"^bytes (\d+)-(\d+)/(\d+)$")


def _upload_dir(upload_id: str) -> Path:
    return UPLOADS_BASE_PATH / upload_id


def _meta_path(upload_id: str) -> Path:
    return _upload_dir(upload_id) / "meta.json"


def _part_path(upload_id: str) -> Path:
    return _upload_dir(upload_id) / "data.part"


def _load_meta(upload_id: str) -> dict:
    meta_path = _meta_path(upload_id)
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Upload not found")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def _save_meta(upload_id: str, meta: dict) -> None:
    _meta_path(upload_id).write_text(
        json.dumps(meta, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _validate_filename(filename: str, file_type: str) -> str:
    allowed = MEDIA_EXTENSIONS if file_type == "media" else PDF_EXTENSIONS
    extension = Path(filename).suffix.lower()
    if extension not in allowed:
        expected = ", ".join(sorted(allowed))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Expected: {expected}",
        )
    return extension


def init_upload(filename: str, file_type: str, total_size: int) -> dict:
    if file_type not in {"media", "pdf"}:
        raise HTTPException(status_code=400, detail="file_type must be 'media' or 'pdf'")
    if total_size <= 0:
        raise HTTPException(status_code=400, detail="total_size must be positive")

    extension = _validate_filename(filename, file_type)
    upload_id = str(uuid.uuid4())
    upload_path = _upload_dir(upload_id)
    upload_path.mkdir(parents=True, exist_ok=True)

    meta = {
        "upload_id": upload_id,
        "filename": Path(filename).name,
        "file_type": file_type,
        "extension": extension,
        "total_size": total_size,
        "received": 0,
        "complete": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_meta(upload_id, meta)
    _part_path(upload_id).touch()

    return {
        "upload_id": upload_id,
        "chunk_size": 10 * 1024 * 1024,
    }


def append_chunk(upload_id: str, content_range: str, data: bytes) -> dict:
    match = CONTENT_RANGE_PATTERN.match(content_range.strip())
    if not match:
        raise HTTPException(status_code=400, detail="Invalid Content-Range header")

    start = int(match.group(1))
    end = int(match.group(2))
    total = int(match.group(3))
    meta = _load_meta(upload_id)

    if meta["complete"]:
        raise HTTPException(status_code=400, detail="Upload already complete")
    if total != meta["total_size"]:
        raise HTTPException(status_code=400, detail="Total size mismatch")
    if start != meta["received"]:
        raise HTTPException(status_code=400, detail="Unexpected chunk offset")
    if len(data) != end - start + 1:
        raise HTTPException(status_code=400, detail="Chunk size mismatch")

    part_path = _part_path(upload_id)
    with part_path.open("ab") as part_file:
        part_file.write(data)

    meta["received"] = end + 1
    if meta["received"] == total:
        meta["complete"] = True
    _save_meta(upload_id, meta)

    return {
        "upload_id": upload_id,
        "received": meta["received"],
        "total_size": total,
        "complete": meta["complete"],
        "progress_pct": round((meta["received"] / total) * 100),
    }


def require_complete_upload(upload_id: str) -> dict:
    meta = _load_meta(upload_id)
    if not meta["complete"]:
        raise HTTPException(status_code=400, detail="Upload is not complete")
    return meta


def finalize_upload_to_raw_media(upload_id: str, raw_media_dir: Path) -> None:
    meta = require_complete_upload(upload_id)
    part_path = _part_path(upload_id)

    if meta["file_type"] == "media":
        dest_name = "lecture.mp4" if meta["extension"] == ".mp4" else "lecture.mp3"
    else:
        dest_name = "presentation.pdf"

    raw_media_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(part_path), str(raw_media_dir / dest_name))
    shutil.rmtree(_upload_dir(upload_id), ignore_errors=True)


def cleanup_upload(upload_id: str) -> None:
    shutil.rmtree(_upload_dir(upload_id), ignore_errors=True)
