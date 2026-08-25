"""Regenerate exam summaries for a course (default: אתיקה) and rebuild combined PDF."""

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
    course_name = sys.argv[1] if len(sys.argv) > 1 else "אתיקה"
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
