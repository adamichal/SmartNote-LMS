import subprocess
from pathlib import Path

from backend.config import AUDIO_SEGMENT_SECONDS, FFMPEG_PATH, WHISPER_MAX_BYTES
from backend.services.job_status import log_pipeline


def _run_ffmpeg(args: list[str], lecture_path: Path, label: str) -> None:
    command = [FFMPEG_PATH, *args]
    log_pipeline(lecture_path, f"Running ffmpeg ({label}): {' '.join(command)}")
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip() or result.stdout.strip() or "Unknown ffmpeg error"
        raise RuntimeError(f"FFmpeg failed ({label}): {stderr}")


def extract_audio(lecture_path: Path) -> Path:
    raw_media = lecture_path / "raw_media"
    mp4_path = raw_media / "lecture.mp4"
    mp3_path = raw_media / "lecture.mp3"

    if mp3_path.exists() and mp3_path.stat().st_size > 0:
        log_pipeline(lecture_path, "Audio extraction skipped — lecture.mp3 already exists")
        return mp3_path

    if mp4_path.exists():
        log_pipeline(lecture_path, "Extracting MP3 from MP4")
        _run_ffmpeg(
            ["-y", "-i", str(mp4_path), "-vn", "-acodec", "mp3", "-ab", "128k", str(mp3_path)],
            lecture_path,
            "extract_audio",
        )
        return mp3_path

    if mp3_path.exists():
        return mp3_path

    raise FileNotFoundError("No lecture.mp4 or lecture.mp3 found in raw_media/")


def split_audio_if_needed(lecture_path: Path, mp3_path: Path) -> list[Path]:
    chunks_dir = lecture_path / "raw_media" / "audio_chunks"
    existing_chunks = sorted(chunks_dir.glob("chunk_*.mp3")) if chunks_dir.exists() else []
    if existing_chunks:
        log_pipeline(lecture_path, f"Audio chunking skipped — {len(existing_chunks)} chunks exist")
        return existing_chunks

    if mp3_path.stat().st_size <= WHISPER_MAX_BYTES:
        log_pipeline(lecture_path, "Audio file within Whisper size limit — no chunking needed")
        return [mp3_path]

    chunks_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = str(chunks_dir / "chunk_%03d.mp3")
    log_pipeline(lecture_path, "Splitting audio into 20-minute chunks")
    _run_ffmpeg(
        [
            "-y",
            "-i",
            str(mp3_path),
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
