from datetime import datetime, timezone
from pathlib import Path

from backend.services import audio, gemini, notebook, pdf, transcription
from backend.services.ffmpeg_utils import resolve_ffmpeg_executable
from backend.services.job_status import log_pipeline, write_job_status


def run_pipeline(lecture_path: Path) -> None:
    log_pipeline(lecture_path, "Pipeline started")

    try:
        ffmpeg_path = resolve_ffmpeg_executable()
        log_pipeline(lecture_path, f"Using FFmpeg: {ffmpeg_path}")

        write_job_status(
            lecture_path,
            status="processing",
            stage="audio_extraction",
            progress_pct=5,
            error=None,
        )
        mp3_path = audio.extract_audio(lecture_path)
        write_job_status(
            lecture_path,
            status="processing",
            stage="audio_extraction",
            progress_pct=10,
            error=None,
        )

        audio_chunks = audio.split_audio_if_needed(lecture_path, mp3_path)
        write_job_status(
            lecture_path,
            status="processing",
            stage="transcribing",
            progress_pct=10,
            error=None,
        )
        transcription.transcribe_audio(lecture_path, audio_chunks)

        write_job_status(
            lecture_path,
            status="processing",
            stage="pdf_processing",
            progress_pct=50,
            error=None,
        )
        pdf.process_pdf(lecture_path)

        write_job_status(
            lecture_path,
            status="processing",
            stage="ai_editing",
            progress_pct=55,
            error=None,
        )
        gemini.generate_notebook_draft(lecture_path)

        write_job_status(
            lecture_path,
            status="processing",
            stage="notebook_assembly",
            progress_pct=88,
            error=None,
        )
        notebook.assemble_notebook(lecture_path)

        write_job_status(
            lecture_path,
            status="completed",
            stage="notebook_assembly",
            progress_pct=100,
            error=None,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        log_pipeline(lecture_path, "Pipeline completed successfully")

    except Exception as exc:
        error_message = str(exc)
        log_pipeline(lecture_path, f"Pipeline failed: {error_message}")
        write_job_status(
            lecture_path,
            status="error",
            error=error_message,
        )


def retry_pipeline(lecture_path: Path) -> None:
    write_job_status(
        lecture_path,
        status="processing",
        stage=None,
        progress_pct=0,
        error=None,
        completed_at=None,
    )
    run_pipeline(lecture_path)
