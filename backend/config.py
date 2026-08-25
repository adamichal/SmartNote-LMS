import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COURSES_BASE_PATH = Path(
    os.getenv("COURSES_BASE_PATH", PROJECT_ROOT / "Courses")
).resolve()
UPLOADS_BASE_PATH = Path(
    os.getenv("UPLOADS_BASE_PATH", PROJECT_ROOT / ".uploads")
).resolve()
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "ivrit-ai/whisper-large-v3-turbo-ct2")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Raw value from .env; resolved at runtime via ffmpeg_utils (with PATH fallback).
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "").strip()

CHUNK_SIZE_BYTES = 10 * 1024 * 1024
WHISPER_MAX_BYTES = 24 * 1024 * 1024
AUDIO_SEGMENT_SECONDS = 20 * 60

COURSE_CONTEXT_MAX_CHARS = int(os.getenv("COURSE_CONTEXT_MAX_CHARS", "60000"))
