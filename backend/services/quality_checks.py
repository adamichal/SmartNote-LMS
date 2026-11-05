"""Quality checks for a finished notebook: slide coverage, image grounding, unsupported numbers.

No Gemini calls — everything is computed from files on disk, and nothing in the
lecture folder is changed except quality_report.json.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

from backend.services.filesystem import parse_lecture_folder
from backend.services.job_status import log_pipeline
from backend.services.notebook_coverage import (
    _load_manifest,
    content_slides,
    is_presentation_pdf,
)
from backend.services.notebook_images import is_non_content_slide

REPORT_FILENAME = "quality_report.json"

# thresholds — first guesses, to be tuned after the manual precision check
SLIDE_COVERED_AT = 0.5  # fraction of a slide's keywords that must appear in the notebook
MIN_SLIDE_KEYWORDS = 2  # slides with fewer keywords (titles etc.) can't be judged
BOILERPLATE_SHARE = 0.4  # a word on this share of slides is a footer/title, not content
MIN_SLIDES_FOR_LEVEL = 5  # fewer checked slides -> coverage doesn't affect the level
COVERAGE_PROBLEM_BELOW = 0.6
COVERAGE_REVIEW_BELOW = 0.8
NUMBERS_REVIEW_AT = 3
MIN_CHECKED_NUMBER = 10  # smaller numbers are mostly exponents, fractions and counts

REPORT_NOTES = [
    "Whisper often writes numbers as Hebrew words (e.g. 'שלושים אחוז'), so a number "
    "said in class can still show up as unsupported.",
    "Numbers written in a different form (2.5 מיליון vs 2,500,000, 50% vs 0.5) are not matched.",
    "Numbers below 10 are not checked.",
    "only_in_ai_context = found only in earlier lectures' AI-made summaries, not in any primary source.",
]

# ---------- words ----------

HEBREW_PREFIXES = set("הובלמשכ")
STOPWORDS = {
    # Hebrew
    "של", "את", "על", "עם", "זה", "זו", "זאת", "הוא", "היא", "הם", "הן", "אני", "אנחנו",
    "אתם", "יש", "אין", "לא", "כן", "גם", "או", "אם", "כי", "אבל", "רק", "כל", "מה", "מי",
    "איך", "למה", "כמו", "אחד", "אחת", "יותר", "פחות", "בין", "לפי", "אחרי", "לפני", "עד",
    "היה", "היו", "להיות", "הזה", "הזאת", "אלה", "אלו", "כך", "כאן", "שם", "מאוד", "עוד",
    "כבר", "אשר", "כאשר", "אותו", "אותה", "אותם", "שלו", "שלה", "שלהם", "ידי", "יכול",
    # English
    "the", "and", "for", "are", "with", "this", "that", "from", "was", "not", "but", "you",
    "all", "can", "has", "have", "its", "our", "who", "how", "what", "why", "when", "which",
}
_WORD = re.compile(r"[A-Za-zא-ת]+")
_IMAGE_MARKUP = re.compile(r"!\[[^\]]*\]\([^)]*\)")


def _variants(word: str) -> list[tuple[str, int]]:
    """The word plus forms with 1-2 Hebrew prefix letters cut off, e.g. והממשלה -> הממשלה -> ממשלה."""
    out = [(word, 0)]
    for depth in (1, 2):
        if len(word) - depth < 3 or word[depth - 1] not in HEBREW_PREFIXES:
            break
        out.append((word[depth:], depth))
    return out


def _word_index(text: str) -> dict[str, int]:
    """Every form of every word in the text -> fewest prefix letters cut to get it."""
    index: dict[str, int] = {}
    for raw in _WORD.findall(text):
        for form, depth in _variants(raw.lower()):
            if depth < index.get(form, 9):
                index[form] = depth
    return index


def _word_found(word: str, index: dict[str, int]) -> bool:
    for form, depth in _variants(word):
        other = index.get(form)
        if other is None:
            continue
        # cutting prefixes on both sides can make short words collide (ממשלה -> שלה),
        # so a shared 3-letter form only counts if at most one prefix letter was cut
        if (depth + other <= 1 and len(form) >= 3) or len(form) >= 4:
            return True
    return False


def slide_keywords(text: str) -> list[str]:
    keywords: list[str] = []
    for raw in _WORD.findall(text):
        word = raw.lower()
        if len(word) < 3 or word in keywords:
            continue
        # skip stopwords, also with one prefix letter (והוא, שהוא)
        if any(form in STOPWORDS for form, depth in _variants(word) if depth <= 1):
            continue
        keywords.append(word)
    return keywords


# ---------- check 1: slide coverage ----------


def _is_hebrew(text: str) -> bool:
    hebrew = len(re.findall(r"[א-ת]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return hebrew >= latin


def check_slide_coverage(slides: list[dict], notebook: str) -> dict:
    # image alt text often repeats the slide text, which isn't real coverage
    body = _IMAGE_MARKUP.sub(" ", notebook)
    index = _word_index(body)
    notebook_hebrew = _is_hebrew(body)

    # English slides vs a Hebrew notebook can't be compared word by word
    same_language = [s for s in slides if _is_hebrew(s["text"]) == notebook_hebrew]
    other_language = len(slides) - len(same_language)

    # footers, lecturer name, course title: words on most slides aren't slide content
    keywords_per_slide = [slide_keywords(s["text"]) for s in same_language]
    boilerplate: set[str] = set()
    if len(keywords_per_slide) >= 5:
        counts: dict[str, int] = {}
        for keywords in keywords_per_slide:
            for word in keywords:
                counts[word] = counts.get(word, 0) + 1
        boilerplate = {w for w, n in counts.items() if n / len(keywords_per_slide) >= BOILERPLATE_SHARE}

    checked = 0
    uncovered = []
    skipped = 0
    for slide, keywords in zip(same_language, keywords_per_slide):
        keywords = [w for w in keywords if w not in boilerplate]
        if len(keywords) < MIN_SLIDE_KEYWORDS:
            skipped += 1
            continue
        checked += 1
        missing = [word for word in keywords if not _word_found(word, index)]
        score = 1 - len(missing) / len(keywords)
        if score < SLIDE_COVERED_AT:
            uncovered.append(
                {
                    "file": slide["file"],
                    "pdf": slide["pdf"],
                    "page": slide["page"],
                    "preview": slide["preview"],
                    "score": round(score, 2),
                    "missing_keywords": missing[:10],
                }
            )
    return {
        "score": round(1 - len(uncovered) / checked, 3) if checked else None,
        "slides_checked": checked,
        "slides_skipped": skipped,  # too few keywords (title slides etc.)
        "slides_other_language": other_language,
        "boilerplate_words": sorted(boilerplate)[:15],
        "uncovered": uncovered,
        "covered_at": SLIDE_COVERED_AT,
    }


# ---------- check 2: images ----------

_IMAGE_REF = re.compile(r"!\[[^\]]*\]\(([^)\s]+)\)")


def check_images(lecture_path: Path, notebook: str) -> dict:
    manifest = {entry.get("file"): entry for entry in _load_manifest(lecture_path)}
    names: list[str] = []
    for match in _IMAGE_REF.finditer(notebook):
        target = match.group(1)
        if "extracted_images/" not in target:
            continue
        name = unquote(target.rsplit("/", 1)[-1])
        if name not in names:
            names.append(name)

    issues = []
    for name in names:
        entry = manifest.get(name)
        if not (lecture_path / "extracted_images" / name).is_file():
            reason = "missing_file"
        elif entry is None:
            reason = "not_in_manifest"
        elif not is_presentation_pdf(entry.get("pdf", "")):
            # the slide catalog Gemini gets lists presentation slides only
            reason = "not_presentation_slide"
        elif is_non_content_slide(entry.get("preview", "")):
            reason = "non_content_slide"
        else:
            continue
        issues.append({"file": name, "reason": reason})
    return {"checked": len(names), "issues": issues}


# ---------- check 3: numbers ----------

# Latin-only lookbehind: a Hebrew prefix glued to a number (ב2008) still counts as a number
_NUMBER = re.compile(r"(?<![A-Za-z0-9_.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?!\d)")
_LIST_OR_HEADING_NUMBER = re.compile(r"^(\s*#+\s*|\s*)\d+(?:\.\d+)*[.)]\s+")
_LINK_TARGET = re.compile(r"\]\([^)]*\)")


def _normalize_number(text: str) -> str:
    value = text.replace(",", "")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value.lstrip("0") or "0"


def numbers_in(text: str) -> set[str]:
    return {_normalize_number(m.group(1)) for m in _NUMBER.finditer(text)}


def _notebook_numbers(notebook: str) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for line in notebook.splitlines():
        # list numbering, heading numbers and image/link targets aren't claims
        clean = _LINK_TARGET.sub("]", _IMAGE_MARKUP.sub(" ", line))
        clean = _LIST_OR_HEADING_NUMBER.sub(r"\1", clean)
        for match in _NUMBER.finditer(clean):
            value = _normalize_number(match.group(1))
            if float(value) < MIN_CHECKED_NUMBER:
                continue
            if value in found:
                found[value]["count"] += 1
                continue
            start, end = max(match.start() - 40, 0), match.end() + 40
            found[value] = {"value": value, "context": " ".join(clean[start:end].split()), "count": 1}
    return found


def check_numbers(notebook: str, sources: dict) -> dict:
    primary = set()
    for key in ("transcript", "pdf_text", "course_context"):
        primary |= numbers_in(sources.get(key, ""))
    ai_context = numbers_in(sources.get("ai_context", ""))

    found = _notebook_numbers(notebook)
    unsupported, only_ai = [], []
    for value, item in found.items():
        if value in primary:
            continue
        (only_ai if value in ai_context else unsupported).append(item)
    return {
        "checked": len(found),
        "unsupported": unsupported,
        "only_in_ai_context": only_ai,
        "ignored_below": MIN_CHECKED_NUMBER,
    }


# ---------- sources (read-only) ----------


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""


def _shared_materials_text(course_path: Path) -> str:
    # same files and layout as course_context, but never writes its text cache
    from backend.services.course_context import (
        ALLOWED_EXTENSIONS,
        _cache_path,
        _extract_pdf_text,
    )

    materials = course_path / "course_materials"
    if not materials.is_dir():
        return ""
    lines = ["# חומרים משותפים לקורס"]
    for entry in sorted(materials.iterdir()):
        if entry.name.startswith(".") or not entry.is_file() or entry.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        try:
            if entry.suffix.lower() == ".pdf":
                cache = _cache_path(course_path, entry)
                text = _read(cache) if cache.is_file() else _extract_pdf_text(entry)
            else:
                text = _read(entry)
        except Exception:
            # one unreadable PDF shouldn't stop the whole check
            continue
        if text.strip():
            lines.append(f"\n## {entry.name}\n{text}")
    return "\n".join(lines) if len(lines) > 1 else ""


def _course_context_as_gemini_saw_it(lecture_path: Path) -> tuple[str, str]:
    """(primary part, AI-made part) of the course context, cut to the same size limit as the prompt.

    Rebuilt here instead of calling build_course_context_for_lecture because that one
    writes a text cache into course_materials/ and looks courses up by name.
    """
    from backend.config import COURSE_CONTEXT_MAX_CHARS
    from backend.services.course_context import _extract_summary_from_notebook

    course_path = lecture_path.parent
    parsed = parse_lecture_folder(lecture_path.name)
    current_number = parsed[0] if parsed else 0

    outline, prior = ["# מבנה הקורס"], ["# סיכומים מהרצאות קודמות"]
    if course_path.is_dir():
        for entry in sorted(course_path.iterdir()):
            other = parse_lecture_folder(entry.name) if entry.is_dir() else None
            if not other:
                continue
            outline.append(f"- הרצאה {other[0]}: {other[1]}")
            if other[0] < current_number:
                summary = _extract_summary_from_notebook(entry / "final_notebook.md")
                if summary:
                    prior.append(f"\n## הרצאה {other[0]}: {other[1]}\n{summary}")

    info = _read(course_path / "course_info.md").strip()
    # same order and priority as build_course_context_for_lecture
    sections = [
        ("primary", f"# תיאור הקורס\n{info}" if info else ""),
        ("primary", "\n".join(outline)),
        # earlier lectures' summaries are in Gemini's context, but they are AI output too
        ("ai", "\n".join(prior) if len(prior) > 1 else ""),
        ("primary", _shared_materials_text(course_path)),
    ]

    # mirrors _truncate_context: whole sections while they fit, then a cut one, then stop
    parts = {"primary": [], "ai": []}
    total = 0
    for kind, text in sections:
        if not text.strip():
            continue
        remaining = COURSE_CONTEXT_MAX_CHARS - total
        if remaining <= 0:
            break
        if len(text) <= remaining:
            parts[kind].append(text)
            total += len(text) + 2
        else:
            cut = text[: remaining - 50]
            last_paragraph = cut.rfind("\n\n")
            if last_paragraph > remaining // 2:
                cut = cut[:last_paragraph]
            parts[kind].append(cut)
            break
    return "\n\n".join(parts["primary"]), "\n\n".join(parts["ai"])


def gather_sources(lecture_path: Path) -> dict:
    """Everything Gemini was given for this lecture, with AI-made context kept apart."""
    transcripts = lecture_path / "transcripts"
    course_context, ai_context = _course_context_as_gemini_saw_it(lecture_path)
    return {
        "transcript": _read(transcripts / "raw_transcript.txt"),
        # pdf_text.txt holds both the slides and the practice / extra material
        "pdf_text": _read(transcripts / "pdf_text.txt"),
        "course_context": course_context,
        "ai_context": ai_context,
    }


# ---------- report ----------


def overall_level(coverage: dict, images: dict, numbers: dict) -> str:
    # a score from 1-2 slides (e.g. the rest are in English) says nothing, so ignore it
    score = coverage["score"] if coverage["slides_checked"] >= MIN_SLIDES_FOR_LEVEL else None
    fabricated = any(i["reason"] in ("missing_file", "not_in_manifest") for i in images["issues"])
    if fabricated or (score is not None and score < COVERAGE_PROBLEM_BELOW):
        return "problem"
    if (
        images["issues"]
        or (score is not None and score < COVERAGE_REVIEW_BELOW)
        or len(numbers["unsupported"]) >= NUMBERS_REVIEW_AT
    ):
        return "review"
    return "ok"


def run_quality_checks(lecture_path: Path, sources: dict | None = None) -> dict:
    """Build the report without writing anything."""
    from backend.services.notebook_quality import structure_warnings
    from backend.services.prompt_version import get_lecture_prompt_version

    notebook = _read(lecture_path / "final_notebook.md")
    if sources is None:
        sources = gather_sources(lecture_path)

    coverage = check_slide_coverage(content_slides(lecture_path), notebook)
    images = check_images(lecture_path, notebook)
    numbers = check_numbers(notebook, sources)
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "level": overall_level(coverage, images, numbers),
        **get_lecture_prompt_version(lecture_path),
        "coverage": coverage,
        "images": images,
        "numbers": numbers,
        "structure_warnings": structure_warnings(notebook, sources.get("transcript", "")),
        "source_chars": {key: len(value) for key, value in sources.items()},
        "notes": REPORT_NOTES,
    }


def write_quality_report(lecture_path: Path) -> dict:
    report = run_quality_checks(lecture_path)
    (lecture_path / REPORT_FILENAME).write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    coverage = report["coverage"]["score"]
    log_pipeline(
        lecture_path,
        f"Quality report: {report['level']} — coverage "
        f"{'n/a' if coverage is None else f'{coverage:.0%}'}, "
        f"{len(report['coverage']['uncovered'])} uncovered slides, "
        f"{len(report['images']['issues'])} image issues, "
        f"{len(report['numbers']['unsupported'])} unsupported numbers",
    )
    return report
