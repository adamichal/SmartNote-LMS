#!/usr/bin/env python3
"""Re-run AI editing + assembly for all lectures in a course (keeps transcripts/PDFs)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.filesystem import get_course_path_or_404, list_lectures
from backend.services.pipeline import run_ai_only_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Retry AI for all lectures in a course")
    parser.add_argument("course_name", help='Course folder name, e.g. "אתיקה"')
    parser.add_argument(
        "--sequential",
        action="store_true",
        help="Process one lecture at a time (slower, gentler on Gemini rate limits)",
    )
    args = parser.parse_args()

    course_path = get_course_path_or_404(args.course_name)
    lectures = sorted(list_lectures(args.course_name), key=lambda item: item["number"])
    if not lectures:
        print(f"No lectures in course: {args.course_name}")
        sys.exit(1)

    print(f"Reprocessing {len(lectures)} lectures in {args.course_name}...")
    for lecture in lectures:
        lecture_path = course_path / lecture["id"]
        print(f"  [{lecture['number']:02d}] {lecture['topic']} ...", flush=True)
        try:
            run_ai_only_pipeline(lecture_path)
            print("       OK")
        except Exception as exc:
            print(f"       FAILED: {exc}")

    print("Done.")


if __name__ == "__main__":
    main()
