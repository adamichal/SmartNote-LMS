"""Regenerate exam summaries for a course and rebuild its combined PDF."""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.services.exam_summary import regenerate_course_exam_summaries
from backend.services.export import export_course_exam_summaries_combined_pdf


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Regenerate exam_summary.md for every lecture in a course that has "
        "a notebook, then rebuild the combined exam-summaries PDF. "
        "Costs one Gemini call per lecture.",
    )
    parser.add_argument("course_name", help='course folder name under Courses/, e.g. "אתיקה"')
    course_name = parser.parse_args().course_name
    print(f"Regenerating exam summaries for: {course_name}")
    result = regenerate_course_exam_summaries(course_name)
    print(f"Done: {len(result['ok'])} ok, {len(result['failed'])} failed")
    if result["failed"]:
        for line in result["failed"]:
            print(f"  - {line}")

    if result["ok"]:
        print("Building combined exam-summaries PDF...")
        pdf_path, filename = export_course_exam_summaries_combined_pdf(course_name)
        print(f"PDF: {pdf_path} ({pdf_path.stat().st_size // 1024} KB) as {filename}")


if __name__ == "__main__":
    main()
