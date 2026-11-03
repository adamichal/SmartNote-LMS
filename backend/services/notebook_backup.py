import shutil
from datetime import datetime
from pathlib import Path

# AI output files we keep a copy of before regenerating (relative to the lecture folder)
AI_OUTPUT_FILES = [
    Path("final_notebook.md"),
    Path("exam_summary.md"),
    Path("transcripts") / "ai_draft.md",
]

BACKUP_DIR_NAME = "backup"


def backup_ai_outputs(lecture_path: Path) -> Path | None:
    """Move the current AI outputs into backup/<timestamp>/. Returns that folder, or None if nothing to back up."""
    existing = [rel for rel in AI_OUTPUT_FILES if (lecture_path / rel).is_file()]
    if not existing:
        return None

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = lecture_path / BACKUP_DIR_NAME / stamp
    # two backups in the same second would collide, so add a counter
    counter = 1
    while backup_dir.exists():
        backup_dir = lecture_path / BACKUP_DIR_NAME / f"{stamp}-{counter}"
        counter += 1
    backup_dir.mkdir(parents=True)

    for rel in existing:
        target = backup_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(lecture_path / rel), str(target))
    return backup_dir


def restore_backup(lecture_path: Path, backup_dir: Path) -> None:
    """Copy the files from a backup folder back in place (overwrites half-made new files).
    The backup folder itself is kept, just in case."""
    for rel in AI_OUTPUT_FILES:
        source = backup_dir / rel
        if not source.is_file():
            # this file didn't exist before the run, so a new partial one shouldn't stay either
            (lecture_path / rel).unlink(missing_ok=True)
            continue
        target = lecture_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def latest_backup_with_notebook(lecture_path: Path) -> Path | None:
    """Newest backup folder that actually has a final_notebook.md."""
    root = lecture_path / BACKUP_DIR_NAME
    if not root.is_dir():
        return None
    # folder names are timestamps, so sorting by name = sorting by time
    for folder in sorted((p for p in root.iterdir() if p.is_dir()), key=lambda p: p.name, reverse=True):
        if (folder / "final_notebook.md").is_file():
            return folder
    return None
