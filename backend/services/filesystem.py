import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from backend.config import COURSES_BASE_PATH
from backend.services import files as file_service

INVALID_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00]')
LECTURE_FOLDER_PATTERN = re.compile(r"^(\d{2})_(.+)$")
LECTURE_SUBDIRS = ("raw_media", "extracted_images", "transcripts")


def _ensure_courses_root() -> Path:
    COURSES_BASE_PATH.mkdir(parents=True, exist_ok=True)
    return COURSES_BASE_PATH


def sanitize_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if INVALID_NAME_CHARS.search(cleaned):
        raise HTTPException(status_code=400, detail="Name contains invalid characters")
    if cleaned in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid name")
    return cleaned


def lecture_folder_name(number: int, topic: str) -> str:
    topic_clean = topic.strip()
    if not topic_clean:
        raise HTTPException(status_code=400, detail="Topic cannot be empty")
    topic_part = re.sub(r"\s+", "_", topic_clean)
    topic_part = INVALID_NAME_CHARS.sub("", topic_part)
    if not topic_part:
        raise HTTPException(status_code=400, detail="Topic contains no valid characters")
    return f"{number:02d}_{topic_part}"


def parse_lecture_folder(folder_name: str) -> tuple[int, str] | None:
    match = LECTURE_FOLDER_PATTERN.match(folder_name)
    if not match:
        return None
    number = int(match.group(1))
    topic = match.group(2).replace("_", " ")
    return number, topic


def _course_path(course_name: str) -> Path:
    safe_name = sanitize_name(course_name)
    return _ensure_courses_root() / safe_name


def _read_lecture_status(lecture_path: Path) -> str:
    status_file = lecture_path / "job_status.json"
    if not status_file.exists():
        return "pending"
    try:
        data = json.loads(status_file.read_text(encoding="utf-8"))
        return data.get("status", "pending")
    except (json.JSONDecodeError, OSError):
        return "unknown"


def list_courses() -> list[dict]:
    root = _ensure_courses_root()
    courses = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        lecture_count = sum(
            1
            for child in entry.iterdir()
            if child.is_dir() and parse_lecture_folder(child.name)
        )
        courses.append({"name": entry.name, "lecture_count": lecture_count})
    return courses


def create_course(name: str) -> dict:
    course_path = _course_path(name)
    safe_name = course_path.name
    if course_path.exists():
        raise HTTPException(status_code=409, detail="Course already exists")
    course_path.mkdir(parents=True, exist_ok=False)
    from backend.services.course_context import ensure_course_materials_dir

    ensure_course_materials_dir(course_path)
    return {"name": safe_name, "lecture_count": 0}


def get_course_path_or_404(course_name: str) -> Path:
    course_path = _course_path(course_name)
    if not course_path.is_dir():
        raise HTTPException(status_code=404, detail="Course not found")
    return course_path


def _validate_lecture_id(lecture_id: str) -> None:
    if not lecture_id or lecture_id in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid lecture id")
    if any(sep in lecture_id for sep in ("/", "\\", "..")):
        raise HTTPException(status_code=400, detail="Invalid lecture id")
    if not parse_lecture_folder(lecture_id):
        raise HTTPException(status_code=400, detail="Invalid lecture id")


def delete_course(course_name: str) -> None:
    course_path = get_course_path_or_404(course_name)
    shutil.rmtree(course_path)


def get_lecture_path(course_name: str, lecture_id: str) -> Path:
    _validate_lecture_id(lecture_id)
    course_path = get_course_path_or_404(course_name)
    lecture_path = course_path / lecture_id
    if not lecture_path.is_dir():
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture_path


def delete_lecture(course_name: str, lecture_id: str) -> None:
    lecture_path = get_lecture_path(course_name, lecture_id)
    shutil.rmtree(lecture_path)


def list_lectures(course_name: str) -> list[dict]:
    course_path = get_course_path_or_404(course_name)
    lectures = []
    for entry in sorted(course_path.iterdir()):
        if not entry.is_dir():
            continue
        parsed = parse_lecture_folder(entry.name)
        if not parsed:
            continue
        number, topic = parsed
        lectures.append(
            {
                "id": entry.name,
                "number": number,
                "topic": topic,
                "status": _read_lecture_status(entry),
            }
        )
    lectures.sort(key=lambda item: item["number"])
    return lectures


def _skipped_stages(has_media: bool, has_transcript: bool) -> list[str]:
    if not has_media:
        return ["audio_extraction", "transcribing"]
    if has_transcript:
        return ["transcribing"]
    return []


def create_lecture(
    course_name: str,
    number: int,
    topic: str,
    media_upload_id: str | None = None,
    pdf_upload_id: str | None = None,
    pdf_upload_ids: list[str] | None = None,
    transcript_upload_id: str | None = None,
    transcript_upload_ids: list[str] | None = None,
    pdf_extra_upload_ids: list[str] | None = None,
    extra_material_upload_ids: list[str] | None = None,
    transcript_text: str | None = None,
    media_path: str | None = None,
    pdf_path: str | None = None,
) -> dict:
    from backend.services import uploads as upload_service
    from backend.services.lecture_sources import write_sources_manifest

    course_path = get_course_path_or_404(course_name)
    folder_name = lecture_folder_name(number, topic)
    lecture_path = course_path / folder_name

    presentation_ids = list(pdf_upload_ids or [])
    if pdf_upload_id and pdf_upload_id not in presentation_ids:
        presentation_ids.insert(0, pdf_upload_id)

    transcript_ids = list(transcript_upload_ids or [])
    if transcript_upload_id and transcript_upload_id not in transcript_ids:
        transcript_ids.insert(0, transcript_upload_id)

    extra_ids = list(extra_material_upload_ids or [])
    for legacy_id in pdf_extra_upload_ids or []:
        if legacy_id not in extra_ids:
            extra_ids.append(legacy_id)

    has_media = bool(media_upload_id or media_path)
    has_pdf = bool(presentation_ids or pdf_path)
    has_transcript = bool(transcript_ids or (transcript_text and transcript_text.strip()))

    if not has_media and not has_pdf and not has_transcript:
        raise HTTPException(
            status_code=400,
            detail="At least one source is required: media, presentation PDF, or transcript",
        )

    if media_path:
        file_service.require_valid_file(media_path, "media")
    if pdf_path:
        file_service.require_valid_file(pdf_path, "pdf")
    if media_upload_id:
        upload_service.require_complete_upload(media_upload_id)
    for upload_id in presentation_ids:
        upload_service.require_complete_upload(upload_id)
    for upload_id in transcript_ids:
        upload_service.require_complete_upload(upload_id)
    for upload_id in extra_ids:
        upload_service.require_complete_upload(upload_id)

    lecture_path.mkdir(parents=True, exist_ok=False)
    upload_ids = [
        upload_id
        for upload_id in [
            media_upload_id,
            *presentation_ids,
            *transcript_ids,
            *extra_ids,
        ]
        if upload_id
    ]

    source_items: list[dict] = []

    try:
        for subdir in LECTURE_SUBDIRS:
            (lecture_path / subdir).mkdir()

        raw_media_dir = lecture_path / "raw_media"

        if media_upload_id:
            source_items.append(
                upload_service.finalize_upload_to_raw_media(media_upload_id, raw_media_dir)
            )
        for index, presentation_id in enumerate(presentation_ids):
            source_items.append(
                upload_service.finalize_presentation_upload(
                    presentation_id,
                    raw_media_dir,
                    index,
                )
            )
        for extra_id in extra_ids:
            source_items.append(
                upload_service.finalize_upload_to_raw_media(extra_id, raw_media_dir)
            )
        if transcript_ids:
            source_items.extend(
                upload_service.finalize_transcript_uploads(transcript_ids, lecture_path)
            )
        pasted_transcript = (transcript_text or "").strip()
        if pasted_transcript:
            transcripts_dir = lecture_path / "transcripts"
            transcripts_dir.mkdir(parents=True, exist_ok=True)
            transcript_path = transcripts_dir / "raw_transcript.txt"
            section = f"### תמלול מודבק\n{pasted_transcript}"
            if transcript_path.exists() and transcript_path.stat().st_size > 0:
                existing = transcript_path.read_text(encoding="utf-8").strip()
                transcript_path.write_text(
                    f"{existing}\n\n---\n\n{section}",
                    encoding="utf-8",
                )
            else:
                transcript_path.write_text(section, encoding="utf-8")
            transcript_entry = {
                "category": "transcript",
                "filename": "raw_transcript.txt",
                "original_name": "תמלול מודבק",
                "extension": ".txt",
                "size_bytes": transcript_path.stat().st_size,
            }
            existing_transcript = next(
                (item for item in source_items if item.get("category") == "transcript"),
                None,
            )
            if existing_transcript:
                existing_transcript["size_bytes"] = transcript_entry["size_bytes"]
                names = [existing_transcript.get("original_name", ""), "תמלול מודבק"]
                existing_transcript["original_name"] = ", ".join(
                    name for name in names if name
                )
            else:
                source_items.append(transcript_entry)
        if media_path:
            file_service.copy_media_file(
                file_service.require_valid_file(media_path, "media"),
                raw_media_dir,
            )
            media_file = next(
                (path for path in raw_media_dir.iterdir() if path.name in {"lecture.mp4", "lecture.mp3"}),
                None,
            )
            if media_file:
                source_items.append(
                    {
                        "category": "media",
                        "filename": media_file.name,
                        "original_name": media_file.name,
                        "extension": media_file.suffix.lower(),
                        "size_bytes": media_file.stat().st_size,
                    }
                )
        if pdf_path:
            file_service.copy_pdf_file(
                file_service.require_valid_file(pdf_path, "pdf"),
                raw_media_dir,
            )
            presentation = raw_media_dir / "presentation.pdf"
            if presentation.exists():
                source_items.append(
                    {
                        "category": "presentation",
                        "filename": presentation.name,
                        "original_name": presentation.name,
                        "extension": ".pdf",
                        "size_bytes": presentation.stat().st_size,
                    }
                )

        write_sources_manifest(lecture_path, source_items)

        now = datetime.now(timezone.utc).isoformat()
        job_status = {
            "job_id": str(uuid.uuid4()),
            "status": "pending",
            "stage": None,
            "progress_pct": 0,
            "error": None,
            "created_at": now,
            "completed_at": None,
            "skipped_stages": _skipped_stages(has_media, has_transcript),
        }
        (lecture_path / "job_status.json").write_text(
            json.dumps(job_status, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        shutil.rmtree(lecture_path, ignore_errors=True)
        for upload_id in upload_ids:
            upload_service.cleanup_upload(upload_id)
        raise

    return {
        "id": folder_name,
        "number": number,
        "topic": topic.strip(),
        "status": "pending",
        "lecture_path": str(lecture_path),
    }


def get_lecture_sources(course_name: str, lecture_id: str) -> dict:
    from backend.services.lecture_sources import scan_lecture_sources, sources_summary

    lecture_path = get_lecture_path(course_name, lecture_id)
    data = scan_lecture_sources(lecture_path)
    items = data.get("items", [])
    return {"items": items, "summary": sources_summary(items)}
