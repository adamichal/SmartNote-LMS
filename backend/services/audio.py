import subprocess
from pathlib import Path

from backend.services.ffmpeg_utils import resolve_ffmpeg_executable
from backend.services.job_status import log_pipeline


def _format_command(command: list[str]) -> str:
    return " ".join(f'"{part}"' if " " in part else part for part in command)


def _verify_media_file(path: Path, lecture_path: Path, label: str) -> Path:
    resolved = path.resolve()
    log_pipeline(lecture_path, f"Checking {label}: {resolved}")
    if not resolved.exists():
        raise FileNotFoundError(f"{label} not found: {resolved}")
    if not resolved.is_file():
        raise FileNotFoundError(f"{label} is not a file: {resolved}")
    if resolved.stat().st_size == 0:
        raise FileNotFoundError(f"{label} is empty: {resolved}")
    return resolved


def _run_ffmpeg(args: list[str], lecture_path: Path, label: str) -> None:
    ffmpeg_path = resolve_ffmpeg_executable()
    command = [ffmpeg_path, *args]
    command_str = _format_command(command)

    log_pipeline(lecture_path, f"FFmpeg executable: {ffmpeg_path}")
    log_pipeline(lecture_path, f"FFmpeg command ({label}): {command_str}")

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"FFmpeg executable not found at '{ffmpeg_path}'. "
            "Check FFMPEG_PATH in .env or install FFmpeg and add it to PATH."
        ) from exc

    if result.returncode != 0:
        stderr = result.stderr.strip() or result.stdout.strip() or "Unknown ffmpeg error"
        log_pipeline(lecture_path, f"FFmpeg stderr ({label}): {stderr}")
        raise RuntimeError(f"FFmpeg failed ({label}): {stderr}")


def extract_audio(lecture_path: Path) -> Path:
    raw_media = lecture_path / "raw_media"
    mp4_path = raw_media / "lecture.mp4"
    mp3_path = raw_media / "lecture.mp3"

    if mp3_path.exists() and mp3_path.stat().st_size > 0:
        log_pipeline(lecture_path, "Audio extraction skipped — lecture.mp3 already exists")
        return _verify_media_file(mp3_path, lecture_path, "Existing MP3")

    if mp4_path.exists():
        verified_mp4 = _verify_media_file(mp4_path, lecture_path, "Input MP4")
        verified_mp3 = mp3_path.resolve()
        log_pipeline(lecture_path, f"Output MP3 path: {verified_mp3}")
        log_pipeline(lecture_path, "Extracting MP3 from MP4")
        _run_ffmpeg(
            [
                "-y",
                "-i",
                str(verified_mp4),
                "-vn",
                "-acodec",
                "mp3",
                "-ab",
                "128k",
                str(verified_mp3),
            ],
            lecture_path,
            "extract_audio",
        )
        return _verify_media_file(mp3_path, lecture_path, "Extracted MP3")

    if mp3_path.exists():
        return _verify_media_file(mp3_path, lecture_path, "Input MP3")

    raise FileNotFoundError("No lecture.mp4 or lecture.mp3 found in raw_media/")


def split_audio_if_needed(lecture_path: Path, mp3_path: Path) -> list[Path]:
    from backend.config import AUDIO_SEGMENT_SECONDS, WHISPER_MAX_BYTES

    verified_mp3 = _verify_media_file(mp3_path, lecture_path, "MP3 for chunking")
    chunks_dir = lecture_path / "raw_media" / "audio_chunks"
    existing_chunks = sorted(chunks_dir.glob("chunk_*.mp3")) if chunks_dir.exists() else []
    if existing_chunks:
        log_pipeline(lecture_path, f"Audio chunking skipped — {len(existing_chunks)} chunks exist")
        return existing_chunks

    if verified_mp3.stat().st_size <= WHISPER_MAX_BYTES:
        log_pipeline(lecture_path, "Audio file within Whisper size limit — no chunking needed")
        return [verified_mp3]

    chunks_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = str((chunks_dir / "chunk_%03d.mp3").resolve())
    log_pipeline(lecture_path, f"Chunk output pattern: {output_pattern}")
    log_pipeline(lecture_path, "Splitting audio into 20-minute chunks")
    _run_ffmpeg(
        [
            "-y",
            "-i",
            str(verified_mp3),
            "-f",
            "segment",
            "-segment_time",
            str(AUDIO_SEGMENT_SECONDS),
            "-c",
            "copy",
            output_pattern,
        ],
        lecture_path,
        "split_audio",
    )

    chunks = sorted(chunks_dir.glob("chunk_*.mp3"))
    if not chunks:
        raise RuntimeError("Audio chunking produced no output files")
    return chunks
