import re
from datetime import date
from pathlib import Path

import google.generativeai as genai

from backend.config import GEMINI_API_KEY
from backend.services.filesystem import parse_lecture_folder
from backend.services.gemini_utils import resolve_gemini_model
from backend.services.job_status import log_pipeline, write_job_status

SYSTEM_PROMPT = """You are an expert academic editor and note-taker. You receive:
1. A raw Hebrew lecture transcript (from Whisper, may contain errors)
2. Extracted text from the lecture's PDF presentation slides

Your job is to produce a complete, structured Hebrew study notebook in Markdown format.
Respond ONLY with the Markdown content. No preamble, no explanation."""

USER_PROMPT_TEMPLATE = """## Raw Transcript:
{raw_transcript}

## PDF Slide Text (Source of Truth for terminology):
{pdf_text}

## Strict Rules:
1. NO OMISSIONS: Include every topic, explanation, and example from the transcript.
   Remove only: filler words ("אמ", "כאילו"), repetitions, and off-topic small talk.
2. TERMINOLOGY FIX: Use the PDF text to correct any misspelled technical terms,
   formulas, or English concepts in the transcript.
3. HIGHLIGHT: Bold (**term**) every key definition and important concept on first mention.
4. STRUCTURE: Organize into clear sections matching the lecture flow.
   Use: # for main topics, ## for subtopics, ### for examples/cases.
5. IMAGE PLACEHOLDERS: Where the speaker references a slide or diagram, insert:
   `![תיאור קצר](./extracted_images/PLACEHOLDER.png)`
   I will match these to actual images later.
6. PDF DIFF SECTION: At the END of the notebook, add a section:
   ## 📋 נושאים מהמצגת שלא נדונו בהרצאה
   List any topics/slides present in the PDF but not covered in the transcript.
   If all topics were covered, write: "כל נושאי המצגת כוסו בהרצאה."
7. RTL: Write in Hebrew (RTL). English terms stay in English inline.
8. MATH: Use LaTeX for any formulas: $formula$ for inline, $$formula$$ for block.

## Output Format:
# {lecture_topic}
**קורס:** {course_name} | **הרצאה:** {lecture_number}
**תאריך עיבוד:** {date}

---
[notebook content here]"""


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    fence_match = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", cleaned, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return cleaned


def _lecture_metadata(lecture_path: Path) -> tuple[str, int, str]:
    course_name = lecture_path.parent.name
    parsed = parse_lecture_folder(lecture_path.name)
    if not parsed:
        raise ValueError(f"Invalid lecture folder name: {lecture_path.name}")
    number, topic = parsed
    return course_name, number, topic


def generate_notebook_draft(lecture_path: Path) -> Path:
    draft_path = lecture_path / "transcripts" / "ai_draft.md"
    if draft_path.exists() and draft_path.stat().st_size > 0:
        log_pipeline(lecture_path, "AI editing skipped — ai_draft.md already exists")
        return draft_path

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    transcript_path = lecture_path / "transcripts" / "raw_transcript.txt"
    pdf_text_path = lecture_path / "transcripts" / "pdf_text.txt"

    if not transcript_path.exists():
        raise FileNotFoundError("raw_transcript.txt not found — run transcription first")
    if not pdf_text_path.exists():
        raise FileNotFoundError("pdf_text.txt not found — run PDF processing first")

    raw_transcript = transcript_path.read_text(encoding="utf-8")
    pdf_text = pdf_text_path.read_text(encoding="utf-8")
    course_name, lecture_number, lecture_topic = _lecture_metadata(lecture_path)

    user_prompt = USER_PROMPT_TEMPLATE.format(
        raw_transcript=raw_transcript,
        pdf_text=pdf_text,
        lecture_topic=lecture_topic,
        course_name=course_name,
        lecture_number=lecture_number,
        date=date.today().isoformat(),
    )

    model_name = resolve_gemini_model()
    log_pipeline(lecture_path, f"Calling Gemini model: {model_name}")
    write_job_status(
        lecture_path,
        status="processing",
        stage="ai_editing",
        progress_pct=60,
        error=None,
    )

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(model_name, system_instruction=SYSTEM_PROMPT)
    response = model.generate_content(user_prompt)

    if not response.text:
        raise RuntimeError("Gemini returned empty response")

    draft_content = _strip_code_fences(response.text)
    draft_path.parent.mkdir(parents=True, exist_ok=True)
    draft_path.write_text(draft_content, encoding="utf-8")

    log_pipeline(lecture_path, f"AI draft saved to {draft_path.name} ({len(draft_content)} chars)")
    write_job_status(
        lecture_path,
        status="processing",
        stage="ai_editing",
        progress_pct=85,
        error=None,
    )
    return draft_path
