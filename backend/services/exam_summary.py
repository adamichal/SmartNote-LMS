"""Exam-focused summary derived from the detailed lecture notebook.

Output adapts to course type (ethics vs technical): denser definitions,
no narrative examples, and no omissions of testable concepts.
"""

from __future__ import annotations

import re
import time
from pathlib import Path

from google.genai import types

from backend.config import GEMINI_API_KEY
from backend.services.filesystem import parse_lecture_folder
from backend.services.gemini_utils import get_client, resolve_gemini_model
from backend.services.job_status import log_pipeline

EXAM_SUMMARY_FILENAME = "exam_summary.md"

_RETRY_DELAYS = [20, 45, 90]
_RETRIABLE_STRINGS = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overloaded")

MAX_INPUT_CHARS = 140_000

EXAM_SUMMARY_SYSTEM = """You distill detailed Hebrew university lecture notebooks into dense EXAM CHEAT-SHEETS.
Style: dictionary / flash-card definitions — precise, dry, exam-ready. NOT stories or anecdotes.
Every concept, thinker, distinction, principle, and testable claim from the notebook MUST appear.
Omit examples, cases, narratives, and "what happened in class" fluff — convert them into the underlying definition or principle only.
Adapt section structure to the course domain (ethics ≠ CS ≠ economics).
Respond ONLY with Markdown. No preamble."""

EXAM_SUMMARY_USER = """## Course name: {course_name}
## Lecture topic: {lecture_topic}
## Course domain guidance:
{domain_guidance}

## Full lecture notebook (SOURCE OF TRUTH — read entirely; omit nothing testable):
{notebook_body}

## Your task
Write a comprehensive **exam summary of the notebook** in Hebrew.
This must let a student revise the whole lecture without re-reading the notebook —
but written as **definitions and sharp points**, not as a retelling.

# סיכום למבחן — {lecture_topic}

---

Follow the section structure from the domain guidance above exactly.
Within each section:
- Prefer format: **מונח / הוגה / גישה** — הגדרה או טענה מדויקת ב-1–2 משפטים ענייניים.
- Prefer format for contrasts: **X לעומת Y** — ההבדל המהותי במשפט אחד.
- Prefer format for principles: **שם העקרון** — מה הוא קובע / מתי חל.
- Use as many bullets as needed to cover ALL testable content (aim high; do not compress away material).
- Minimum roughly: 15+ definitions, 8+ distinctions/thinkers when the notebook has them — more for long lectures.

## Hard quality rules
1. **Completeness:** Every key term, thinker, approach, dilemma-type, framework, criterion, and distinction in the notebook must appear. If it is in the notebook, it belongs in the summary.
2. **No examples section. No case narratives.** Do NOT write "לדוגמה...", story retellings, or company anecdotes. If a case taught a principle — write only the principle/definition.
3. **No generic filler** ("חשוב להבין את החומר", "יש לזכור את המושגים").
4. **No inventing** content absent from the notebook.
5. **Skip irrelevant sections entirely** — if domain guidance says to omit algorithms for ethics, do not include an algorithms section at all (not even "לא רלוונטי").
6. Hebrew RTL; keep standard English/Latin terms (Deontology, Utilitarianism, etc.) inline in parentheses when useful.
7. Output ONLY the summary document — no preamble."""


def _course_domain_guidance(course_name: str) -> str:
    name = (course_name or "").strip()
    lowered = name.casefold()

    if any(token in lowered for token in ("אתיקה", "ethic", "מוסר")):
        return """COURSE TYPE: ETHICS / PHILOSOPHY / TECHNOLOGY ETHICS.

Mandatory sections (use these headings exactly):

## מושגים והגדרות
כל מושג מההרצאה — הגדרה מדויקת ועניינית.

## הוגים וגישות
לכל הוגה/זרם: מי / מה הגישה / מה הטענה המרכזית / מה מקור המוסר לפי הגישה.
למשל: קאנט, יום, הובס, סוקרטס, תועלתנות, דאונטולוגיה, רלטיביזם, אמנה חברתית וכו'.

## דילמות ומסגרות ניתוח
סוגי דילמות, מסגרות לניתוח, מבחנים / קריטריונים להחלטה מוסרית, מתחים אתיים מרכזיים.

## הבחנות וניואנסים
הבדלים קריטיים למבחן (X לעומת Y), תנאים → מסקנות, ניסוחים מדויקים שהמרצה הדגיש.

## נקודות מפתח למבחן
טענות לבחינה, נוסחי עקרונות (למשל צו קטגורי), טעויות נפוצות, שאלות "הסבר / השווה / הגדר".

DO NOT include: אלגוריתמים, פרוטוקולים, דוגמאות ומקרים, סיפורים, אנקדוטות חברה/מוצר.
Convert any case study into the principle it illustrated — leave the story out."""

    if any(token in lowered for token in ("כלכל", "econ", "מימון", "חשבונ")):
        return """COURSE TYPE: ECONOMICS / BUSINESS.

Mandatory sections:
## מושגים והגדרות
## מודלים, נוסחאות וקשרים
## הנחות, תנאים ומגבלות
## הבחנות וניואנסים
## נקודות מפתח למבחן

Omit narrative examples; keep formulas precise. Skip algorithms unless present."""

    if any(
        token in lowered
        for token in ("אבטח", "רשת", "תכנות", "מערכות", "אלגורית", "security", "cs", "מחשב")
    ):
        return """COURSE TYPE: COMPUTER SCIENCE / SECURITY / ENGINEERING.

Mandatory sections:
## מושגים והגדרות
## עקרונות, כללים ומסגרות
## הבחנות וניואנסים
## אלגוריתמים, פרוטוקולים ותהליכים
## נקודות מפתח למבחן

Include steps/parameters for algorithms and protocols. NO examples section — fold protocol steps into the algorithms section."""

    return """COURSE TYPE: GENERAL ACADEMIC.

Adapt sections to what the notebook actually teaches. Prefer:

## מושגים והגדרות
## עקרונות / מסגרות / מודלים
## הבחנות וניואנסים
## תהליכים או שיטות (רק אם קיימים במחברת)
## נקודות מפתח למבחן

NEVER include a dedicated examples/cases storytelling section.
NEVER include algorithms unless the notebook actually teaches algorithms/protocols.
Match the discipline of THIS course (`{course}`): if it is theory/philosophy/ethics, prioritize thinkers, approaches, dilemmas, definitions.""".replace(
        "{course}", name or "(לא צוין)"
    )


def _fill_prompt_template(template: str, **values: str) -> str:
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{key}}}", value)
    return result


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    fence_match = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", cleaned, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return cleaned


def _truncate_notebook(notebook: str) -> str:
    if len(notebook) <= MAX_INPUT_CHARS:
        return notebook
    half = MAX_INPUT_CHARS // 2
    return (
        notebook[:half]
        + "\n\n[... אמצע המחברת הושמט בגלל אורך — הסיכום חייב עדיין לכסות את כל הנושאים "
        "מהתחלה ומהסוף ...]\n\n"
        + notebook[-half:]
    )


def exam_summary_path(lecture_path: Path) -> Path:
    return lecture_path / EXAM_SUMMARY_FILENAME


def read_exam_summary(lecture_path: Path) -> str:
    path = exam_summary_path(lecture_path)
    if not path.exists():
        raise FileNotFoundError("exam_summary.md not found")
    return path.read_text(encoding="utf-8")


def save_exam_summary(lecture_path: Path, content: str) -> Path:
    path = exam_summary_path(lecture_path)
    path.write_text(content.strip() + "\n", encoding="utf-8")
    return path


def _lecture_topic(lecture_path: Path) -> str:
    parsed = parse_lecture_folder(lecture_path.name)
    if not parsed:
        return lecture_path.name
    return parsed[1]


def _call_gemini(client, model_name: str, user_prompt: str, lecture_path: Path):
    for attempt in range(len(_RETRY_DELAYS) + 1):
        try:
            return client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(system_instruction=EXAM_SUMMARY_SYSTEM),
            )
        except Exception as exc:
            error_str = str(exc)
            is_retriable = any(s in error_str for s in _RETRIABLE_STRINGS)
            if not is_retriable or attempt >= len(_RETRY_DELAYS):
                raise
            time.sleep(_RETRY_DELAYS[attempt])
    raise RuntimeError("Gemini exam summary retry limit reached")


def generate_exam_summary(lecture_path: Path, notebook_content: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    if not notebook_content.strip():
        raise RuntimeError("Notebook is empty — cannot generate exam summary")

    course_name = lecture_path.parent.name
    topic = _lecture_topic(lecture_path)
    user_prompt = _fill_prompt_template(
        EXAM_SUMMARY_USER,
        notebook_body=_truncate_notebook(notebook_content),
        lecture_topic=topic,
        course_name=course_name,
        domain_guidance=_course_domain_guidance(course_name),
    )

    model_name = resolve_gemini_model()
    # no job_status write here: this also runs outside the pipeline (editor button,
    # scripts), and nothing would set the status back to "completed" afterwards
    log_pipeline(lecture_path, f"Generating exam summary ({model_name})")

    client = get_client()
    response = _call_gemini(client, model_name, user_prompt, lecture_path)
    if not response.text:
        raise RuntimeError("Gemini returned empty exam summary")

    summary = _strip_code_fences(response.text).strip()
    if not re.match(r"^#\s+סיכום", summary):
        summary = f"# סיכום למבחן — {topic}\n\n---\n\n{summary}"
    return summary


def refresh_exam_summary(lecture_path: Path, notebook_content: str) -> Path:
    """Generate and save exam_summary.md from the full notebook."""
    summary = generate_exam_summary(lecture_path, notebook_content)
    path = save_exam_summary(lecture_path, summary)
    log_pipeline(lecture_path, f"Exam summary saved ({len(summary)} chars)")
    return path


def regenerate_course_exam_summaries(course_name: str) -> dict:
    """Rebuild exam_summary.md for every lecture that has a notebook."""
    from backend.services.filesystem import get_course_path_or_404, list_lectures
    from backend.services.notebook import read_notebook

    course_path = get_course_path_or_404(course_name)
    lectures = list_lectures(course_name)
    ok: list[str] = []
    failed: list[str] = []

    for lecture in lectures:
        lecture_path = course_path / lecture["id"]
        notebook_file = lecture_path / "final_notebook.md"
        if not notebook_file.is_file():
            continue
        try:
            content = read_notebook(lecture_path)
            refresh_exam_summary(lecture_path, content)
            ok.append(lecture["id"])
            print(f"OK  {lecture['id']}")
        except Exception as exc:
            failed.append(f"{lecture['id']}: {exc}")
            print(f"FAIL {lecture['id']}: {exc}")

    return {"ok": ok, "failed": failed}
