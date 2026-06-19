from pathlib import Path

from openai import OpenAI

from backend.config import OPENAI_API_KEY
from backend.services.job_status import log_pipeline, write_job_status


def transcribe_audio(lecture_path: Path, audio_chunks: list[Path]) -> Path:
    transcript_path = lecture_path / "transcripts" / "raw_transcript.txt"
    if transcript_path.exists() and transcript_path.stat().st_size > 0:
        log_pipeline(lecture_path, "Transcription skipped — raw_transcript.txt already exists")
        return transcript_path

    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    client = OpenAI(api_key=OPENAI_API_KEY)
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
        log_pipeline(
            lecture_path,
            f"Transcribing chunk {index}/{total_chunks}: {chunk_path.name}",
        )

        with chunk_path.open("rb") as audio_file:
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="he",
                response_format="text",
            )

        text = result if isinstance(result, str) else getattr(result, "text", str(result))
        parts.append(text.strip())

    full_transcript = "\n\n".join(part for part in parts if part)
    transcript_path.write_text(full_transcript, encoding="utf-8")
    log_pipeline(lecture_path, f"Transcription saved to {transcript_path.name}")
    return transcript_path
