"""Light post-processing for notebooks (metadata cleanup only)."""

import re

METADATA_LINE = re.compile(
    r"^\*\*(?:קורס|הרצאה|תאריך עיבוד):",
    re.MULTILINE,
)


def strip_notebook_metadata(content: str) -> str:
    lines = []
    for line in content.splitlines():
        if METADATA_LINE.match(line.strip()):
            continue
        lines.append(line)
    return "\n".join(lines)


def format_notebook_content(content: str) -> str:
    if not content:
        return content
    result = strip_notebook_metadata(content)
    result = re.sub(r"\n{3,}", "\n\n", result).strip()
    return f"{result}\n" if result else ""
