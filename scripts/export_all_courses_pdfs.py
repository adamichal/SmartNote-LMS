"""Export all completed course notebooks to PDF ZIP files."""

import argparse
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.config import COURSES_BASE_PATH
from backend.services.export import export_course_notebooks_zip


def main() -> None:
    argparse.ArgumentParser(
        description="Export a PDF ZIP per course (every course with notebooks) to "
        "~/Downloads/SmartNote_Exports. No arguments, no Gemini calls.",
    ).parse_args()

    output_dir = Path.home() / "Downloads" / "SmartNote_Exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    courses = sorted(
        path for path in COURSES_BASE_PATH.iterdir() if path.is_dir()
    )
    if not courses:
        print("No courses found.")
        return

    for course_path in courses:
        course_name = course_path.name
        notebook_count = sum(
            1
            for lecture in course_path.iterdir()
            if lecture.is_dir() and (lecture / "final_notebook.md").is_file()
        )
        if notebook_count == 0:
            print(f"SKIP {course_name} — no notebooks")
            continue

        print(f"Exporting {course_name} ({notebook_count} notebooks)...")
        try:
            zip_path, filename = export_course_notebooks_zip(course_name)
            destination = output_dir / filename
            shutil.copy2(zip_path, destination)
            print(f"OK   {destination}")
        except Exception as exc:
            print(f"FAIL {course_name}: {exc}")

    print(f"\nDone. Files saved to: {output_dir}")


if __name__ == "__main__":
    main()
