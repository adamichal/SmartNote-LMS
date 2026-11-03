import re
import time
from datetime import date
from pathlib import Path

from google.genai import types

from backend.config import GEMINI_API_KEY
from backend.services.course_context import build_course_context_for_lecture
from backend.services.filesystem import parse_lecture_folder
from backend.services.gemini_utils import get_client, resolve_gemini_model
from backend.services.job_status import log_pipeline, write_job_status
from backend.services.notebook import build_slide_catalog
from backend.services.notebook_coverage import build_topic_checklist
from backend.services.notebook_quality import log_notebook_quality
from backend.services.source_text import format_practice_block, split_pdf_text

SYSTEM_PROMPT = """You are the perfect university student — meticulous, clear, and thorough.
You sat in the lecture, listened carefully, photographed key slides, and wrote comprehensive notes.
Your notebook captures the FULL flow of the lesson: what was said, what appeared on slides,
examples from class, and practice material when provided.

CRITICAL GOAL: Someone who missed the lecture reads your notes and learns EVERYTHING —
as if they were there. Write in rich detail. Never compress away examples, debates, or nuance.
This is the PRIMARY study document — NOT a summary. A separate exam summary will be generated later.

Voice: first-person plural or neutral academic Hebrew ("המרצה הסביר...", "בשלב זה רואים ש...").
Respond ONLY with Markdown. No preamble."""

USER_PROMPT_TEMPLATE = """## Raw Transcript (what was said in class — PRIMARY for flow and explanations):
{raw_transcript}

## Presentation PDF text (slide wording — authoritative for terms and lists):
{presentation_text}

## Practice / supplementary material (תרגול, דפי עזר — integrate when relevant):
{practice_text}

## Course Context (terminology, prerequisites, cross-references — NOT lecture content):
{course_context}

## Available slide images (MAIN PRESENTATIONS ONLY — embed relevant slides in the notes):
{slide_catalog}

## Topic coverage checklist (from slides — every item must be covered in the notes):
{topic_checklist}

## Strict Rules:

### A. Completeness & accuracy
1. NO OMISSIONS: Cover EVERY topic, argument, example, case study, and distinction from the transcript.
   Preserve worked examples, debates, and nuance in full. Remove only filler ("אמ", "כאילו") and repetition.
2. SOURCE PRIORITY: Transcript = chronological flow and spoken explanations.
   Presentation PDF = exact terms, definitions, lists on slides. Cross-check both.
3. PRACTICE MATERIAL: If practice/supplementary text exists, weave it into the notes where the lecturer
   would have used it — under a ### חומר תרגול subsection inside the relevant topic, or a dedicated
   ## תרגול section at the natural point in the lecture. Include exercise statements and solutions
   when the material provides them. Do not ignore uploaded practice sheets.
4. COURSE CONTEXT: Use only for consistent terminology and brief cross-refs.
5. CHECKLIST: Every slide topic in the checklist must appear with a real explanation.

### B. Structure — like excellent student notes
6. OUTPUT HEADER — title only, no metadata (no course name, lecture number, or date):
   # {lecture_topic}
   ---
7. Optional short opener (2–4 sentences): ## פתיחה — what today's lecture is about and how it connects.
8. MAIN BODY — follow the lecture chronologically, block by block:
   - ## for each major segment (as the lecture progressed)
   - ### for subtopics, arguments, examples, or case studies
   - #### sparingly for fine points
   - Separate major ## blocks with `---`
9. WRITING STYLE:
   - Narrate the lesson: "המרצה פתח ב...", "לאחר מכן עבר ל...", "כאן הודגש ש..."
   - Quote important lecturer phrases in blockquotes when memorable or exam-relevant.
   - **Bold** key terms on first mention. Definitions inline or as:
     `> **הגדרה — מונח:** הסבר מלא`
   - When the lecturer gave an example — write it out completely (scenario, steps, conclusion).
   - When a slide was shown — embed the image nearby and explain what it illustrates.
10. MATH: LaTeX ($inline$, $$block$$). CODE: fenced blocks.
11. NO Mermaid / ASCII diagrams. Explain flows in words or numbered lists.

### C. Images (presentation slides — illustrate the notes)
12. Embed 5–12 relevant slides from USABLE SLIDES in the catalog.
    - Place each image next to the paragraph discussing that slide's content.
    - Alt text MUST match PREVIEW — never invent charts/graphs not on the slide.
    - Skip title, thank-you, questions, bibliography slides.
    - Syntax: `![תיאור לפי PREVIEW](./extracted_images/FILENAME.png)`

### D. Closing transparency (optional, brief)
13. If presentation topics were NOT discussed in the transcript, add at the very end:

## 📋 נושאים מהמצגת שלא נדונו בהרצאה
List them briefly. If all covered: "כל נושאי המצגת כוסו בהרצאה."

### E. What NOT to include
14. Do NOT write a summary section (no ## סיכום, no ## מילון מונחים, no ## נקודות למבחן).
    Those are generated separately from your notes. Focus on maximum detail in the body.
15. Do NOT write ## מטרות למידה or ## תוכן עניינים — the notes themselves are the content.

### F. Language
16. Hebrew RTL. English academic terms inline where standard.
17. When in doubt — include the example, the distinction, and the slide. More detail is better.

## Output Format:
# {lecture_topic}

---
[full detailed student notebook — no metadata lines]"""


def _fill_prompt_template(template: str, **values: str) -> str:
    """Insert prompt fields without Python str.format (course text may contain braces)."""
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{key}}}", value)
    return result


_RETRY_DELAYS = [20, 45, 90]
_RETRIABLE_STRINGS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overloaded")


def _call_gemini_with_retry(client, model_name: str, user_prompt: str, lecture_path: Path):
    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            return client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            )
        except Exception as exc:
            error_str = str(exc)
            is_retriable = any(s in error_str for s in _RETRIABLE_STRINGS)
            if not is_retriable or attempt >= len(_RETRY_DELAYS):
                raise
            delay = _RETRY_DELAYS[attempt]
            log_pipeline(
                lecture_path,
                f"Gemini attempt {attempt + 1} failed ({exc.__class__.__name__}) — "
                f"retrying in {delay}s: {error_str[:120]}",
            )
            write_job_status(
                lecture_path,
                status="processing",
                stage="ai_editing",
                progress_pct=60,
                error=f"Gemini עמוס — מנסה שוב בעוד {delay} שניות (ניסיון {attempt + 1}/{len(_RETRY_DELAYS)})",
            )
            time.sleep(delay)
    raise RuntimeError("Gemini retry limit reached")


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
        transcript_path.parent.mkdir(parents=True, exist_ok=True)
        transcript_path.write_text("", encoding="utf-8")
    if not pdf_text_path.exists():
        pdf_text_path.parent.mkdir(parents=True, exist_ok=True)
        pdf_text_path.write_text("", encoding="utf-8")

    raw_transcript = transcript_path.read_text(encoding="utf-8").strip()
    pdf_text = pdf_text_path.read_text(encoding="utf-8").strip()
    if not raw_transcript:
        raw_transcript = "(לא סופק תמלול להרצאה זו — הסתמך על חומרי המצגת והמקורות הנוספים.)"
    presentation_text, practice_text = split_pdf_text(pdf_text)
    if not presentation_text.strip():
        presentation_text = pdf_text or "(לא סופקו מצגות בפורמט מסמך.)"

    course_context = build_course_context_for_lecture(lecture_path)
    course_name, lecture_number, lecture_topic = _lecture_metadata(lecture_path)

    user_prompt = _fill_prompt_template(
        USER_PROMPT_TEMPLATE,
        raw_transcript=raw_transcript,
        presentation_text=presentation_text,
        practice_text=format_practice_block(practice_text),
        course_context=course_context or "(אין הקשר קורס זמין)",
        slide_catalog=build_slide_catalog(lecture_path, presentations_only=True),
        topic_checklist=build_topic_checklist(lecture_path, pdf_text),
        lecture_topic=lecture_topic,
        course_name=course_name,
        lecture_number=str(lecture_number),
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
    response = _call_gemini_with_retry(client, model_name, user_prompt, lecture_path)

    if not response.text:
        raise RuntimeError("Gemini returned empty response")

    draft_content = _strip_code_fences(response.text)
    log_notebook_quality(lecture_path, draft_content, raw_transcript, pdf_text)

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
