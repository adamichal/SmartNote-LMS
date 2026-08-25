from pathlib import Path

from backend.config import WHISPER_COMPUTE_TYPE, WHISPER_DEVICE, WHISPER_MODEL
from backend.services.job_status import log_pipeline, write_job_status

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    return _model


def transcribe_audio(lecture_path: Path, audio_chunks: list[Path]) -> Path:
    transcript_path = lecture_path / "transcripts" / "raw_transcript.txt"
    if transcript_path.exists() and transcript_path.stat().st_size > 0:
        log_pipeline(lecture_path, "Transcription skipped — raw_transcript.txt already exists")
        return transcript_path

    log_pipeline(
        lecture_path,
        f"Loading Whisper model: {WHISPER_MODEL} (device={WHISPER_DEVICE}, compute_type={WHISPER_COMPUTE_TYPE})",
    )
    model = _get_model()
    transcript_path.parent.mkdir(parents=True, exist_ok=True)

    parts: list[str] = []
    total_chunks = len(audio_chunks)

    for index, chunk_path in enumerate(audio_chunks, start=1):
        progress = 10 + round((index / total_chunks) * 40)
        write_job_status(
            lecture_path,
            status="processing",
            stage="transcribing",
            progress_pct=progress,
            error=None,
        )
        log_pipeline(lecture_path, f"Transcribing chunk {index}/{total_chunks}: {chunk_path.name}")

        segments, _info = model.transcribe(str(chunk_path), language="he", beam_size=5)
        text = " ".join(segment.text for segment in segments).strip()
        if text:
            parts.append(text)

    full_transcript = "\n\n".join(parts)
    transcript_path.write_text(full_transcript, encoding="utf-8")
    log_pipeline(lecture_path, f"Transcription saved to {transcript_path.name}")
    return transcript_path
