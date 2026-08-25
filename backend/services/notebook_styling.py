from backend.services.notebook_format import format_notebook_content

import re

LIST_ITEM_DEFINITION = re.compile(
    r"^(?P<indent>\s*)[-*]\s+\*\*(הגדרה\b[^*]*)\*\*(?P<trail>.*)$",
    re.MULTILINE | re.UNICODE,
)
STANDALONE_DEFINITION = re.compile(
    r"^(?P<indent>\s*)(?P<body>\*\*הגדרה\b[^*]*\*\*[^\n]*)$",
    re.MULTILINE | re.UNICODE,
)
MERMAID_FENCE = re.compile(r"```mermaid\s*\n[\s\S]*?```", re.IGNORECASE)


def _normalize_definition_term(term: str) -> str:
    cleaned = term.strip()
    if re.search(r"הגדרה\s*[—\-–:]", cleaned):
        return cleaned
    return re.sub(r"^הגדרה\s+", "הגדרה — ", cleaned, count=1)


def _to_definition_blockquote(term: str, trail: str) -> str:
    normalized = _normalize_definition_term(term)
    line = f"> **{normalized}**{trail}".rstrip()
    return line


def normalize_definitions_to_blockquotes(content: str) -> str:
    def replace_list_item(match: re.Match) -> str:
        return _to_definition_blockquote(match.group(2), match.group(3))

    def replace_standalone(match: re.Match) -> str:
        body = match.group("body").strip()
        inner = re.match(r"\*\*(הגדרה\b[^*]*)\*\*(.*)", body, re.UNICODE)
        if not inner:
            return match.group(0)
        return _to_definition_blockquote(inner.group(1), inner.group(2))

    updated = LIST_ITEM_DEFINITION.sub(replace_list_item, content)
    updated = STANDALONE_DEFINITION.sub(replace_standalone, updated)
    return updated


def strip_mermaid_diagrams(content: str) -> str:
    """Remove Mermaid blocks — diagrams are disabled in generated notebooks."""
    cleaned = MERMAID_FENCE.sub("", content)
    return re.sub(r"\n{3,}", "\n\n", cleaned)


def enrich_notebook_markdown(content: str) -> str:
    normalized = normalize_definitions_to_blockquotes(content)
    normalized = strip_mermaid_diagrams(normalized)
    return format_notebook_content(normalized)
