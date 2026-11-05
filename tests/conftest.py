"""Shared fixtures. All lecture content here is invented (a made-up community-garden course)."""

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

FOOTER = "גינה קהילתית לדוגמה"

# six invented content slides + a title slide; every slide carries the same footer
SLIDES = [
    "גינה קהילתית",  # title slide, too short to be a content slide
    "השקיה בטפטוף חוסכת מים ומונעת מחלות עלים, חיסכון של 40% בצריכה",
    "קומפוסט ביתי משפר את מבנה הקרקע ומזין את הצמחים לאורך העונה",
    "מחזור גידולים מונע התשה של הקרקע ומצמצם מזיקים בערוגות",
    "שתילת פרחים מושכת דבורים ומשפרת האבקה של ירקות בקיץ",
    "חיפוי קרקע בקש שומר על לחות ומדכא עשבים שוטים בגינה",
    "ערוגות מוגבהות מקלות על העבודה ומשפרות ניקוז בחורף",
]

TRANSCRIPT = (
    "היום נדבר על הגינה. השקיה של בערך 15 דקות ביום מספיקה לרוב הירקות. "
    "המרצה סיפר שבגינה שלו יש שלושים ערוגות."  # a number written as a word, like Whisper does
)
PRACTICE = "תרגיל: חשבו כמה ליטרים צריך עבור 120 שתילים."
COURSE_INFO = "הקורס כולל 28 מפגשים בשטח."

GOOD_NOTEBOOK = """# גינה קהילתית

## 1. השקיה

ההשקיה בטפטוף חוסכת מים ומונעת מחלות עלים. לפי המצגת מדובר בחיסכון של 40% בצריכה,
ובכיתה נאמר שמספיקות 15 דקות ביום.

![השקיה בטפטוף](./extracted_images/page_002.png)

## 2. קומפוסט ומחזור גידולים

הקומפוסט הביתי משפר את מבנה הקרקע ומזין את הצמחים לאורך כל העונה.
מחזור הגידולים מונע את התשת הקרקע ומצמצם את המזיקים בערוגות.

## 3. דבורים וחיפוי

שתילת הפרחים מושכת דבורים ומשפרת את ההאבקה של הירקות בקיץ.
חיפוי הקרקע בקש שומר על הלחות ומדכא עשבים שוטים בגינה.

## 4. ערוגות

1. ערוגות מוגבהות מקלות על העבודה ומשפרות את הניקוז בחורף.
2. בתרגול חישבנו כמות מים עבור 120 שתילים, וכל הקורס הוא 28 מפגשים.
3. מספיקות 3 ערוגות להתחלה.
"""


def _pdf_text() -> str:
    pages = [f"--- PDF page {i} (presentation.pdf) ---\n{text}\n{FOOTER}" for i, text in enumerate(SLIDES, 1)]
    return (
        "### מצגת 1\n" + "\n\n".join(pages)
        + "\n\n### extra material 1\n--- PDF page 1 (extra_material_1.pdf) ---\n" + PRACTICE
    )


def _manifest() -> list[dict]:
    entries = [
        {"file": f"page_{i:03d}.png", "pdf": "presentation.pdf", "page": i - 1, "preview": f"{text} {FOOTER}"}
        for i, text in enumerate(SLIDES, 1)
    ]
    entries.append({"file": "extra_material_1_page_001.png", "pdf": "extra_material_1.pdf", "page": 0, "preview": PRACTICE})
    return entries


@pytest.fixture
def make_lecture(tmp_path):
    """Build an invented lecture folder; pass a notebook text and optional extras."""

    def build(notebook: str = GOOD_NOTEBOOK, folder: str = "02_גינה_קהילתית", prior_summary: str | None = None) -> Path:
        course = tmp_path / "קורס_גינון"
        lecture = course / folder
        (lecture / "transcripts").mkdir(parents=True)
        images = lecture / "extracted_images"
        images.mkdir()
        manifest = _manifest()
        for entry in manifest:
            (images / entry["file"]).write_bytes(b"")
        (images / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        (lecture / "transcripts" / "raw_transcript.txt").write_text(TRANSCRIPT, encoding="utf-8")
        (lecture / "transcripts" / "pdf_text.txt").write_text(_pdf_text(), encoding="utf-8")
        (lecture / "final_notebook.md").write_text(notebook, encoding="utf-8")
        (course / "course_info.md").write_text(COURSE_INFO, encoding="utf-8")
        if prior_summary is not None:
            prior = course / "01_הרצאה_קודמת"
            prior.mkdir()
            (prior / "exam_summary.md").write_text(prior_summary, encoding="utf-8")
        return lecture

    return build
