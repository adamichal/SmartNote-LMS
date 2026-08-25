"""Add summary / placement / exam sections to existing course notebooks."""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.services.notebook_sections import augment_course_notebook_sections


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Add סיכום מהיר / מיקום בקורס / נקודות למבחן to existing notebooks",
    )
    parser.add_argument("course_name", help="Course folder name")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate sections but do not save files",
    )
    args = parser.parse_args()

    results = augment_course_notebook_sections(args.course_name, dry_run=args.dry_run)
    for item in results:
        lecture = item["lecture_id"]
        status = item["status"]
        if status == "updated":
            added = ", ".join(item.get("added", [])) or "—"
            styled = " + styling" if item.get("styled") else ""
            print(f"OK  {lecture} — added: {added}{styled}")
        elif status == "dry_run":
            added = ", ".join(item.get("added", [])) or "—"
            styled = " + styling" if item.get("styled") else ""
            print(f"DRY {lecture} — would add: {added}{styled}")
        else:
            reason = item.get("reason", "")
            print(f"SKIP {lecture} — {reason}")


if __name__ == "__main__":
    main()
