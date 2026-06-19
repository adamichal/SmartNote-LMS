import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

_resolved_ffmpeg: str | None = None
_startup_status: dict | None = None


def resolve_ffmpeg_executable() -> str:
    """Resolve FFmpeg binary: prefer FFMPEG_PATH from .env, fall back to system PATH."""
    global _resolved_ffmpeg
    if _resolved_ffmpeg:
        return _resolved_ffmpeg

    env_path = os.getenv("FFMPEG_PATH", "").strip()
    tried: list[str] = []

    if env_path:
        configured = Path(env_path).expanduser()
        tried.append(str(configured.resolve() if configured.exists() else configured))
        if configured.is_file():
            _resolved_ffmpeg = str(configured.resolve())
            logger.info("FFmpeg resolved from FFMPEG_PATH: %s", _resolved_ffmpeg)
            return _resolved_ffmpeg
        logger.warning(
            "FFMPEG_PATH is set but file not found: %s — falling back to system PATH",
            configured,
        )

    path_ffmpeg = shutil.which("ffmpeg")
    if path_ffmpeg:
        _resolved_ffmpeg = str(Path(path_ffmpeg).resolve())
        logger.info("FFmpeg resolved from system PATH: %s", _resolved_ffmpeg)
        return _resolved_ffmpeg

    tried.append("ffmpeg (system PATH)")
    detail = ", ".join(tried)
    raise RuntimeError(
        f"FFmpeg not found. Checked: {detail}. "
        "Install FFmpeg and set FFMPEG_PATH in .env, or add ffmpeg to your system PATH."
    )


def verify_ffmpeg_on_startup() -> dict:
    """Run at app startup; returns status dict and logs a clear message."""
    global _startup_status
    try:
        ffmpeg_path = resolve_ffmpeg_executable()
        result = subprocess.run(
            [ffmpeg_path, "-version"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg at '{ffmpeg_path}' returned exit code {result.returncode}"
            )

        version_line = result.stdout.splitlines()[0] if result.stdout else "unknown version"
        _startup_status = {
            "available": True,
            "path": ffmpeg_path,
            "version": version_line,
            "message": "FFmpeg OK",
        }
        logger.info("FFmpeg startup check passed: %s (%s)", ffmpeg_path, version_line)
    except Exception as exc:
        _startup_status = {
            "available": False,
            "path": os.getenv("FFMPEG_PATH", "").strip() or None,
            "version": None,
            "message": str(exc),
        }
        logger.error("FFmpeg startup check FAILED: %s", exc)
        logger.error(
            "Audio extraction will not work. Set FFMPEG_PATH in .env to the full path "
            "of ffmpeg.exe (e.g. C:/ffmpeg/bin/ffmpeg.exe) or add FFmpeg to your PATH."
        )

    return _startup_status


def get_startup_status() -> dict:
    if _startup_status is None:
        return verify_ffmpeg_on_startup()
    return _startup_status
