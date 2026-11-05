"""Measure how many planted problems the quality checks catch (recall).

Copies one real notebook to a temp folder, removes 2 random content sections and
inserts 2 invented numbers, runs the checks on the copy and reports how many of
the 4 planted problems were caught. The real lecture folder is only read.
No Gemini calls.
"""

import argparse
import random
import re
import shutil
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.services.filesystem import parse_lecture_folder
from backend.services.notebook_coverage import content_slides
from backend.services.quality_checks import (
    _word_found,
    _word_index,
    check_slide_coverage,
    gather_sources,
    numbers_in,
    run_quality_checks,
    slide_keywords,
)

# callout / meta sections aren't lecture content, so they aren't removed
SKIP_SECTION = re.compile(r"סיכום|מיקום בקורס|נקודות למבחן|נושאים מהמצגת|לא נדונו|פתיחה|תרגול|🔗|📋")
MIN_SECTION_CHARS = 300


def copy_lecture(real: Path, temp_root: Path) -> Path:
    # only what the checks read: notebook, transcripts, slide images + manifest
    copy = temp_root / real.parent.name / real.name
    (copy / "transcripts").mkdir(parents=True)
    shutil.copy2(real / "final_notebook.md", copy / "final_notebook.md")
    for name in ("raw_transcript.txt", "pdf_text.txt"):
        if (real / "transcripts" / name).is_file():
            shutil.copy2(real / "transcripts" / name, copy / "transcripts" / name)
    if (real / "extracted_images").is_dir():
        shutil.copytree(real / "extracted_images", copy / "extracted_images")
    return copy


def split_sections(lines: list[str]) -> list[dict]:
    """## sections as line ranges."""
    starts = [i for i, line in enumerate(lines) if line.startswith("## ")]
    sections = []
    for n, start in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        sections.append({"start": start, "end": end, "heading": lines[start].strip(), "text": "\n".join(lines[start:end])})
    return sections


def keyword_hits(slide: dict, text: str) -> int:
    index = _word_index(text)
    return sum(_word_found(word, index) for word in slide_keywords(slide["text"]))


def invented_number(rng: random.Random, low: int, high: int, known: set[str]) -> int:
    while True:
        value = rng.randint(low, high)
        if str(value) not in known:
            return value


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Plant 4 known problems (2 removed sections, 2 invented numbers) in a temp copy "
        "of a real notebook and report how many the quality checks catch. "
        "The real lecture folder is only read. No Gemini calls.",
    )
    parser.add_argument("lecture", type=Path, help="path to a lecture folder, e.g. Courses/<course>/03_<topic>")
    parser.add_argument("--seed", type=int, help="seed, to repeat the same planted problems")
    parser.add_argument("--keep", action="store_true", help="keep the temp copy to inspect it")
    args = parser.parse_args()

    real = args.lecture.resolve()
    if not parse_lecture_folder(real.name) or not (real / "final_notebook.md").is_file():
        parser.error(f"not a lecture folder with a notebook: {real}")

    seed = args.seed if args.seed is not None else random.randrange(10_000)
    rng = random.Random(seed)
    temp_root = Path(tempfile.mkdtemp(prefix="smartnote_recall_"))
    try:
        lecture = copy_lecture(real, temp_root)
        # sources (transcript, slides, course context) come from the real folder, read-only
        sources = gather_sources(real)
        slides = content_slides(lecture)
        notebook = (lecture / "final_notebook.md").read_text(encoding="utf-8")
        baseline = check_slide_coverage(slides, notebook)
        baseline_uncovered = {(s["pdf"], s["page"]) for s in baseline["uncovered"]}

        # --- plant 1+2: remove two random content sections ---
        lines = notebook.splitlines()
        candidates = [
            s for s in split_sections(lines)
            if not SKIP_SECTION.search(s["heading"]) and len(s["text"]) >= MIN_SECTION_CHARS
        ]
        removed = rng.sample(candidates, min(2, len(candidates)))
        drop = {i for s in removed for i in range(s["start"], s["end"])}
        kept_lines = [line for i, line in enumerate(lines) if i not in drop]

        # --- plant 3+4: two invented numbers, absent from every source and the notebook ---
        known = numbers_in(notebook) | set().union(*(numbers_in(text) for text in sources.values()))
        percent = invented_number(rng, 101, 989, known)
        year = invented_number(rng, 1101, 1899, known | {str(percent)})
        body_lines = [
            i for i, line in enumerate(kept_lines)
            if len(line) > 60 and not re.match(r"^\s*([#>|!*\-$]|\d)", line) and "$" not in line
        ]
        planted_at = rng.sample(body_lines, 2)
        kept_lines[planted_at[0]] += f" לפי הנתונים שהוצגו, השיעור עמד על {percent}%."
        kept_lines[planted_at[1]] += f" מקור הנתון הוא מחקר משנת {year}."
        (lecture / "final_notebook.md").write_text("\n".join(kept_lines) + "\n", encoding="utf-8")

        report = run_quality_checks(lecture, sources=sources)

        # --- score it ---
        newly_uncovered = [s for s in report["coverage"]["uncovered"] if (s["pdf"], s["page"]) not in baseline_uncovered]
        slide_by_key = {(s["pdf"], s["page"]): s for s in slides}
        results = []
        for section in removed:
            # a newly uncovered slide belongs to the removed section that held most of its words
            owned = [
                s for s in newly_uncovered
                if max(removed, key=lambda r: keyword_hits(slide_by_key[(s["pdf"], s["page"])], r["text"])) is section
            ]
            if owned:
                pages = ", ".join(f"p.{s['page']} ({s['score']})" for s in owned)
                results.append((True, f"removed section {section['heading'][:60]!r} -> now uncovered: {pages}"))
                continue
            best = max(slides, key=lambda s: keyword_hits(s, section["text"]), default=None)
            if best is None or keyword_hits(best, section["text"]) < 3:
                why = "no slide matches this section (content came from the transcript) — slide coverage can't see it by design"
            else:
                why = f"closest slide p.{best['page']} still counts as covered — its words appear elsewhere in the notebook"
            results.append((False, f"removed section {section['heading'][:60]!r} -> {why}"))

        unsupported = {item["value"] for item in report["numbers"]["unsupported"]}
        for value, label in ((percent, f"{percent}%"), (year, f"year {year}")):
            caught = str(value) in unsupported
            results.append((caught, f"invented number {label} -> {'flagged as unsupported' if caught else 'not flagged'}"))

        # --- print ---
        print(f"Recall check: {real.parent.name} / {real.name}   (seed {seed}, repeat with --seed {seed})")
        print(f"Baseline: {len(slides)} content slides, {len(baseline['uncovered'])} already uncovered\n")
        for caught, text in results:
            print(f"  [{'caught' if caught else 'MISSED'}] {text}")
        planted = len(results)
        print(f"\nRecall: {sum(c for c, _ in results)}/{planted}")
        if len(removed) < 2:
            print(f"(only {len(removed)} content sections of {MIN_SECTION_CHARS}+ chars found, so fewer problems were planted)")
    finally:
        if args.keep:
            print(f"\nTemp copy kept at: {temp_root}")
        else:
            shutil.rmtree(temp_root, ignore_errors=True)


if __name__ == "__main__":
    main()
