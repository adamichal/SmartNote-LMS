"""Split combined PDF text into presentation vs practice/supplementary sources."""

from __future__ import annotations

import re

_SECTION_HEADER = re.compile(r"^###\s+(.+)$", re.MULTILINE)
_PRACTICE_HINT = re.compile(
    r"(?i)(extra\s*material|תרגול|תרגיל|exercise|worksheet|handout|חוברת|מטלה|שאלות)",
)


def _is_practice_section(header: str) -> bool:
    return bool(_PRACTICE_HINT.search(header))


def split_pdf_text(pdf_text: str) -> tuple[str, str]:
    """Return (presentation_text, practice_text)."""
    text = (pdf_text or "").strip()
    if not text:
        return "", ""

    matches = list(_SECTION_HEADER.finditer(text))
    if not matches:
        return text, ""

    presentation_parts: list[str] = []
    practice_parts: list[str] = []

    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        header = match.group(1).strip()
        if _is_practice_section(header):
            practice_parts.append(block)
        else:
            presentation_parts.append(block)

    return "\n\n".join(presentation_parts), "\n\n".join(practice_parts)


def format_practice_block(practice_text: str) -> str:
    if not practice_text.strip():
        return "(לא סופק חומר תרגול להרצאה זו.)"
    return practice_text.strip()
