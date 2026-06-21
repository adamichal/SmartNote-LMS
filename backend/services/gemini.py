import re
from datetime import date
from pathlib import Path

from google.genai import types

from backend.config import GEMINI_API_KEY
from backend.services.course_context import build_course_context_for_lecture
from backend.services.filesystem import parse_lecture_folder
from backend.services.notebook import build_slide_catalog
from backend.services.gemini_utils import get_client, resolve_gemini_model
from backend.services.job_status import log_pipeline, write_job_status

SYSTEM_PROMPT = """You are an expert academic editor and note-taker. You receive:
1. A Hebrew lecture transcript (from Whisper or a user-provided file, may contain errors)
2. Extracted text from the lecture PDFs (presentation and any supplementary materials)
3. Course-wide context (description, lecture outline, prior summaries, shared materials)

Your job is to produce a complete, structured Hebrew study notebook in Markdown format.
Respond ONLY with the Markdown content. No preamble, no explanation."""

USER_PROMPT_TEMPLATE = """## Raw Transcript:
{raw_transcript}

## PDF Text (presentation + supplementary sources — source of truth for terminology):
{pdf_text}

## Course Context (terminology, prerequisites, cross-references — DO NOT treat as lecture content):
{course_context}

## Available slide images (full PDF pages):
{slide_catalog}

## Strict Rules:
1. OPEN WITH SUMMARY: Right after the header metadata, add:
   ## סיכום מהיר
   3–6 bullet points capturing the lecture's core ideas (concise, exam-oriented).
2. COURSE PLACEMENT: Immediately after ## סיכום מהיר, add:
   ## 🔗 מיקום בקורס
   Brief note on where this lecture fits in the course arc (prerequisites covered, topics this builds on, what comes next).
   Use course context ONLY — do not invent connections.
3. COURSE CONTEXT USE: Use course context ONLY for:
   - Consistent terminology across lectures
   - Prerequisites and brief cross-references ("כפי שנלמד בהרצאה 2...")
   - Disambiguating terms that appear in multiple lectures
   Do NOT copy or paraphrase content from other lectures' summaries or shared materials into this notebook.
4. NO OMISSIONS: Include every topic, explanation, and example from the transcript.
   Preserve ALL worked examples, numerical demonstrations, and case studies — do not summarize them away.
   Remove only: filler words ("אמ", "כאילו"), repetitions, and off-topic small talk.
5. SOURCE PRIORITY: For terminology and technical accuracy, PDF text overrides transcript.
   For explanations and examples, transcript is primary; use PDF to correct misspellings and verify terms.
6. TERMINOLOGY FIX: Use the PDF text to correct any misspelled technical terms,
   formulas, or English concepts in the transcript.
7. HIGHLIGHT: Bold (**term**) every key definition and important concept on first mention.
8. DEFINITIONS: Format key definitions as blockquotes:
   `> **הגדרה — מונח:** הסבר קצר וברור`
9. STRUCTURE: Organize into clear sections matching the lecture flow.
   Use: # for main topics, ## for subtopics, ### for examples/cases.
   Separate major sections with `---` on its own line.
10. IMAGES: Insert a slide image ONLY when the transcript clearly discusses that specific slide.
   Use the exact filename from the catalog, e.g. `![תיאור קצר](./extracted_images/page_023.png)`.
   Match by comparing transcript content to the slide preview text.
   Do NOT guess filenames. Do NOT insert images for every section. If unsure, omit the image.
11. EXAM SECTION: Before the PDF diff section, add:
   ## 💡 נקודות למבחן
   Bullet list of the most testable concepts, distinctions, and formulas.
12. PDF DIFF SECTION: At the END of the notebook, add a section:
   ## 📋 נושאים מהמצגת שלא נדונו בהרצאה
   List any topics/slides present in the PDF but not covered in the transcript.
   If all topics were covered, write: "כל נושאי המצגת כוסו בהרצאה."
13. RTL: Write in Hebrew (RTL). English terms stay in English inline.
14. MATH: Use LaTeX for any formulas: $formula$ for inline, $$formula$$ for block.

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
    course_context = build_course_context_for_lecture(lecture_path)
    course_name, lecture_number, lecture_topic = _lecture_metadata(lecture_path)

    user_prompt = USER_PROMPT_TEMPLATE.format(
        raw_transcript=raw_transcript,
        pdf_text=pdf_text,
        course_context=course_context or "(אין הקשר קורס זמין)",
        slide_catalog=build_slide_catalog(lecture_path),
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

    client = get_client()
    response = client.models.generate_content(
        model=model_name,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )

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
