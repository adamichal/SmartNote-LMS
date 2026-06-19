import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COURSES_BASE_PATH = Path(
    os.getenv("COURSES_BASE_PATH", PROJECT_ROOT / "Courses")
).resolve()
