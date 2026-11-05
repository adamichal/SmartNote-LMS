"""Run the notebook quality checks over all existing notebooks (no Gemini calls)."""

import argparse
import csv
import random
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.config import COURSES_BASE_PATH
from backend.services.filesystem import parse_lecture_folder
from backend.services.quality_checks import (
    MIN_SLIDES_FOR_LEVEL,
    run_quality_checks,
    write_quality_report,
)

CSV_COLUMNS = [
    "course", "lecture", "prompt_version", "prompt_version_inferred", "level", "coverage",
    "slides_checked", "slides_uncovered", "slides_other_language", "image_issues",
    "numbers_checked", "numbers_unsupported", "numbers_only_in_ai_context",
]


def find_lectures(course_filter: str | None) -> list[Path]:
    lectures = []
    for course in sorted(p for p in COURSES_BASE_PATH.iterdir() if p.is_dir()):
        if course_filter and course.name != course_filter:
            continue
        for lecture in sorted(course.iterdir()):
            if lecture.is_dir() and parse_lecture_folder(lecture.name) and (lecture / "final_notebook.md").is_file():
                lectures.append(lecture)
    return lectures


def version_label(report: dict) -> str:
    return report["prompt_version"] + (" (inferred)" if report["prompt_version_inferred"] else "")


def print_summary(rows: list[tuple[Path, dict]]) -> None:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for lecture, report in rows:
        groups[(lecture.parent.name, version_label(report))].append(report)

    header = f"{'course':<28} {'prompt version':<28} {'lectures':>8} {'avg cov':>8} {'flagged':>8} {'problem':>8} {'img':>5} {'nums':>5}"
    print(header)
    print("-" * len(header))
    # one row per course AND prompt version, so old-prompt numbers never mix with new ones
    for (course, version), reports in sorted(groups.items()):
        scores = [
            r["coverage"]["score"] for r in reports
            if r["coverage"]["score"] is not None and r["coverage"]["slides_checked"] >= MIN_SLIDES_FOR_LEVEL
        ]
        avg = f"{sum(scores) / len(scores):.0%}" if scores else "n/a"
        flagged = sum(r["level"] != "ok" for r in reports)
        problems = sum(r["level"] == "problem" for r in reports)
        images = sum(len(r["images"]["issues"]) for r in reports)
        numbers = sum(len(r["numbers"]["unsupported"]) for r in reports)
        print(f"{course[:28]:<28} {version[:28]:<28} {len(reports):>8} {avg:>8} {flagged:>8} {problems:>8} {images:>5} {numbers:>5}")
    print("\navg cov = mean slide coverage (lectures with enough same-language slides only)")
    print("flagged = level review or problem; img / nums = total image issues / unsupported numbers")


def write_csv(rows: list[tuple[Path, dict]], path: Path) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:  # -sig so Excel shows Hebrew
        writer = csv.writer(handle)
        writer.writerow(CSV_COLUMNS)
        for lecture, r in rows:
            writer.writerow([
                lecture.parent.name, lecture.name, r["prompt_version"], r["prompt_version_inferred"],
                r["level"], r["coverage"]["score"], r["coverage"]["slides_checked"],
                len(r["coverage"]["uncovered"]), r["coverage"]["slides_other_language"],
                len(r["images"]["issues"]), r["numbers"]["checked"],
                len(r["numbers"]["unsupported"]), len(r["numbers"]["only_in_ai_context"]),
            ])


def flagged_items(rows: list[tuple[Path, dict]]) -> dict[str, list[dict]]:
    items: dict[str, list[dict]] = {"uncovered slide": [], "image": [], "unsupported number": []}
    for lecture, r in rows:
        where = f"{lecture.parent.name} / {lecture.name}"
        for slide in r["coverage"]["uncovered"]:
            items["uncovered slide"].append({
                "where": where,
                "what": f"{slide['pdf']} page {slide['page']} ({slide['file']}), score {slide['score']}",
                "detail": f"slide: {slide['preview']}\n      missing words: {', '.join(slide['missing_keywords'])}",
            })
        for issue in r["images"]["issues"]:
            items["image"].append({"where": where, "what": issue["file"], "detail": f"reason: {issue['reason']}"})
        for number in r["numbers"]["unsupported"]:
            items["unsupported number"].append({
                "where": where,
                "what": f"{number['value']} (x{number['count']})",
                "detail": f"context: ...{number['context']}...",
            })
    return items


def print_sample(rows: list[tuple[Path, dict]], n: int, seed: int) -> None:
    rng = random.Random(seed)
    pools = {kind: rng.sample(items, len(items)) for kind, items in flagged_items(rows).items() if items}
    # stratified: take turns between check types so one noisy check can't fill the whole sample
    picked = []
    while len(picked) < n and any(pools.values()):
        for kind, pool in pools.items():
            if pool and len(picked) < n:
                picked.append((kind, pool.pop()))

    print(f"\n=== {len(picked)} random flagged items for manual review (seed {seed}) ===")
    print("For each one, check the slide / sources and mark: real problem or false alarm.\n")
    for index, (kind, item) in enumerate(picked, 1):
        print(f"{index}. [{kind}] {item['where']}")
        print(f"      {item['what']}")
        print(f"      {item['detail']}")
        print("      [ ] real   [ ] false alarm\n")
    counts = ", ".join(f"{kind}: {sum(1 for k, _ in picked if k == kind)}" for kind in pools)
    print(f"by type — {counts}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the quality checks on every existing notebook, write quality_report.json "
        "in each lecture folder, print a summary per course and prompt version, and save a CSV. "
        "No Gemini calls.",
    )
    parser.add_argument("--course", help="only this course folder")
    parser.add_argument("--csv", type=Path, default=PROJECT_ROOT / "quality_audit.csv", help="CSV output path")
    parser.add_argument("--no-write", action="store_true", help="don't write quality_report.json files")
    parser.add_argument("--sample", type=int, metavar="N", help="print N random flagged items (stratified by check type)")
    parser.add_argument("--seed", type=int, help="seed for --sample, to get the same sample again")
    args = parser.parse_args()

    lectures = find_lectures(args.course)
    if not lectures:
        print("No notebooks found.")
        return

    rows = []
    for lecture in lectures:
        try:
            report = run_quality_checks(lecture) if args.no_write else write_quality_report(lecture, log=False)
        except Exception as exc:
            print(f"FAIL {lecture.parent.name} / {lecture.name}: {exc}")
            continue
        rows.append((lecture, report))

    print_summary(rows)
    write_csv(rows, args.csv)
    print(f"\nCSV: {args.csv}")
    if not args.no_write:
        print(f"quality_report.json written in {len(rows)} lecture folders")

    if args.sample:
        seed = args.seed if args.seed is not None else random.randrange(10_000)
        print_sample(rows, args.sample, seed)


if __name__ == "__main__":
    main()
