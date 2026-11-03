"""Export combined course PDFs (notebooks + exam summaries)."""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.services.export import (
    export_course_exam_summaries_combined_pdf,
    export_course_notebooks_combined_pdf,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build two combined PDFs for a course: all notebooks and all "
        "exam summaries. No Gemini calls.",
    )
    parser.add_argument("course_name", help='course folder name under Courses/, e.g. "אתיקה"')
    course_name = parser.parse_args().course_name
    print(f"Exporting combined PDFs for: {course_name}")

    notebooks_path, _ = export_course_notebooks_combined_pdf(course_name)
    print(f"Notebooks PDF: {notebooks_path} ({notebooks_path.stat().st_size // 1024} KB)")

    summaries_path, _ = export_course_exam_summaries_combined_pdf(course_name)
    print(f"Exam summaries PDF: {summaries_path} ({summaries_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
