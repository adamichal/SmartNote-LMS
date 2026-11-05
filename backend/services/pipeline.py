from datetime import datetime, timezone
from pathlib import Path

from backend.services import audio, gemini, notebook, pdf, transcription
from backend.services.ffmpeg_utils import resolve_ffmpeg_executable
from backend.services.job_status import log_pipeline, write_job_status
from backend.services.notebook_backup import (
    BACKUP_DIR_NAME,
    backup_ai_outputs,
    restore_backup,
)
from backend.services.prompt_version import current_prompt_version


def _write_quality_report_safely(lecture_path: Path) -> None:
    # local checks only (no Gemini); a bug here must never turn a finished notebook into an error
    from backend.services.quality_checks import write_quality_report

    try:
        write_quality_report(lecture_path)
    except Exception as exc:
        log_pipeline(lecture_path, f"Quality report failed (notebook is fine): {exc}")


def _has_transcript(lecture_path: Path) -> bool:
    transcript_path = lecture_path / "transcripts" / "raw_transcript.txt"
    return transcript_path.exists() and transcript_path.stat().st_size > 0


def _has_media(lecture_path: Path) -> bool:
    raw_media = lecture_path / "raw_media"
    return any((raw_media / name).exists() for name in ("lecture.mp4", "lecture.mp3"))


def run_pipeline(lecture_path: Path) -> None:
    log_pipeline(lecture_path, "Pipeline started")

    try:
        if _has_transcript(lecture_path):
            log_pipeline(lecture_path, "Transcript provided — skipping audio extraction and Whisper")
            write_job_status(
                lecture_path,
                status="processing",
                stage="transcribing",
                progress_pct=50,
                error=None,
            )
        elif not _has_media(lecture_path):
            log_pipeline(lecture_path, "No media file — skipping audio extraction and Whisper")
            write_job_status(
                lecture_path,
                status="processing",
                stage="transcribing",
                progress_pct=50,
                error=None,
            )
        else:
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
            # which prompt generated this notebook — quality numbers are grouped by it
            prompt_version=current_prompt_version(),
        )
        log_pipeline(lecture_path, "Pipeline completed successfully")
        _write_quality_report_safely(lecture_path)

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


def run_ai_only_pipeline(lecture_path: Path) -> None:
    """Re-run only the AI editing + assembly stages, skipping audio/transcription/PDF."""
    log_pipeline(lecture_path, "AI-only reprocess started")
    write_job_status(
        lecture_path,
        status="processing",
        stage="ai_editing",
        progress_pct=55,
        error=None,
        completed_at=None,
        skipped_stages=["audio_extraction", "transcribing", "pdf_processing"],
    )

    backup_dir = None
    try:
        # move old outputs aside (not delete) so a failed run doesn't lose the notebook
        backup_dir = backup_ai_outputs(lecture_path)
        if backup_dir:
            log_pipeline(lecture_path, f"Old notebook files backed up to {BACKUP_DIR_NAME}/{backup_dir.name}")

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
            # which prompt generated this notebook — quality numbers are grouped by it
            prompt_version=current_prompt_version(),
        )
        log_pipeline(lecture_path, "AI-only reprocess completed")
        _write_quality_report_safely(lecture_path)

    except Exception as exc:
        error_message = str(exc)
        log_pipeline(lecture_path, f"AI-only reprocess failed: {error_message}")
        if backup_dir:
            try:
                restore_backup(lecture_path, backup_dir)
                log_pipeline(lecture_path, f"Restored previous notebook from {BACKUP_DIR_NAME}/{backup_dir.name}")
            except Exception as restore_exc:
                # still write the error status below, the files stay in backup/
                log_pipeline(lecture_path, f"Restore from backup failed: {restore_exc}")
        write_job_status(
            lecture_path,
            status="error",
            error=error_message,
        )
