import pytest

from backend.services import exam_summary, gemini
from backend.services.filesystem import parse_lecture_folder


def test_parse_lecture_folder():
    assert parse_lecture_folder("03_קומפוסט_ביתי") == (3, "קומפוסט ביתי")
    assert parse_lecture_folder("12_Intro") == (12, "Intro")
    assert parse_lecture_folder("3_one_digit") is None
    assert parse_lecture_folder("course_materials") is None


# the same two helpers exist in gemini.py and exam_summary.py, so test both copies
@pytest.mark.parametrize("module", [gemini, exam_summary])
def test_strip_code_fences(module):
    assert module._strip_code_fences("```markdown\n# כותרת\nטקסט\n```") == "# כותרת\nטקסט"
    assert module._strip_code_fences("```\n# כותרת\n```") == "# כותרת"
    assert module._strip_code_fences("  # בלי גדר  ") == "# בלי גדר"
    # a code block inside the text is kept
    assert module._strip_code_fences("# א\n```python\nx = 1\n```\nסוף") == "# א\n```python\nx = 1\n```\nסוף"


@pytest.mark.parametrize("module", [gemini, exam_summary])
def test_fill_prompt_template_keeps_braces_in_values(module):
    template = "נושא: {topic}\nטקסט: {body}\nלא קיים: {missing}"
    filled = module._fill_prompt_template(template, topic="קומפוסט", body="f(x) = {a, b}")
    # values are inserted as-is (str.format would choke on the braces); unknown fields stay
    assert filled == "נושא: קומפוסט\nטקסט: f(x) = {a, b}\nלא קיים: {missing}"
