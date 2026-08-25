"""Copy final notebooks from parallel course folder and mark lectures completed."""
from datetime import datetime, timezone
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
SRC_COURSE = PROJECT / "Courses" / "אבטחת מחשבים ורשתות"
DST_COURSE = PROJECT / "Courses" / "אבטחה"

MAPPINGS = [
    (
        "01_מבוא_לאבטחת_מידע_ואיומי_סייבר",
        "01_מבוא",
        "מבוא",
    ),
    (
        "02_מבוא_לקריפטוגרפיה_והצפנה_סימטרית",
        "02_מבוא_לקריפטוגרפיה_והצפנה_סימטרית",
        "מבוא לקריפטוגרפיה והצפנה סימטרית",
    ),
]


def main() -> None:
    for src_id, dst_id, topic in MAPPINGS:
        src_nb = SRC_COURSE / src_id / "final_notebook.md"
        dst_dir = DST_COURSE / dst_id
        dst_nb = dst_dir / "final_notebook.md"
        if not src_nb.is_file():
            print(f"SKIP {dst_id}: source notebook missing")
            continue
        if not dst_dir.is_dir():
            print(f"SKIP {dst_id}: lecture folder missing")
            continue

        content = src_nb.read_text(encoding="utf-8")
        lines = content.splitlines()
        lines[0] = f"# {topic}"
        lines[1] = f"**קורס:** אבטחה | **הרצאה:** {dst_id.split('_')[0].lstrip('0') or '0'}"
        lines[2] = f"**תאריך עיבוד:** {datetime.now().date().isoformat()}"
        dst_nb.write_text("\n".join(lines) + "\n", encoding="utf-8")

        status_path = dst_dir / "job_status.json"
        status = {}
        if status_path.exists():
            status = json.loads(status_path.read_text(encoding="utf-8"))
        status.update(
            {
                "status": "completed",
                "stage": "notebook_assembly",
                "progress_pct": 100,
                "error": None,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        status_path.write_text(
            json.dumps(status, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"OK {dst_id} -> final_notebook.md")


if __name__ == "__main__":
    main()
