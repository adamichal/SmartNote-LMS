import json

from conftest import GOOD_NOTEBOOK

from backend.services.quality_checks import (
    REPORT_FILENAME,
    _notebook_numbers,
    _word_found,
    _word_index,
    check_slide_coverage,
    run_quality_checks,
    slide_keywords,
    write_quality_report,
)

# ---------- whole notebooks ----------


def test_good_notebook_is_ok(make_lecture):
    report = run_quality_checks(make_lecture())
    assert report["level"] == "ok"
    assert report["coverage"]["uncovered"] == []
    assert report["coverage"]["slides_checked"] == 6
    assert report["coverage"]["slides_skipped"] == 1  # the title slide
    assert report["images"]["issues"] == []
    assert report["numbers"]["unsupported"] == []


def test_missing_topic_lists_that_slide(make_lecture):
    notebook = GOOD_NOTEBOOK.replace("שתילת הפרחים מושכת דבורים ומשפרת את ההאבקה של הירקות בקיץ.\n", "")
    uncovered = run_quality_checks(make_lecture(notebook))["coverage"]["uncovered"]
    assert [slide["page"] for slide in uncovered] == [5]
    assert "דבורים" not in uncovered[0]["missing_keywords"]  # still in the ## heading


def test_two_missing_topics_need_review(make_lecture):
    notebook = (
        GOOD_NOTEBOOK.replace("שתילת הפרחים מושכת דבורים ומשפרת את ההאבקה של הירקות בקיץ.\n", "")
        .replace("חיפוי הקרקע בקש שומר על הלחות ומדכא עשבים שוטים בגינה.\n", "")
    )
    report = run_quality_checks(make_lecture(notebook))
    assert len(report["coverage"]["uncovered"]) == 2
    assert report["level"] == "review"  # 4/6 covered


def test_fake_image_is_a_problem(make_lecture):
    notebook = GOOD_NOTEBOOK + "\n![גרף שלא קיים](./extracted_images/page_099.png)\n"
    report = run_quality_checks(make_lecture(notebook))
    assert report["images"]["issues"] == [{"file": "page_099.png", "reason": "missing_file"}]
    assert report["level"] == "problem"


def test_image_outside_the_slide_catalog(make_lecture):
    # exists on disk, but comes from the practice PDF, which isn't in Gemini's slide catalog
    notebook = GOOD_NOTEBOOK + "\n![תרגיל](./extracted_images/extra_material_1_page_001.png)\n"
    report = run_quality_checks(make_lecture(notebook))
    assert report["images"]["issues"] == [
        {"file": "extra_material_1_page_001.png", "reason": "not_presentation_slide"}
    ]
    assert report["level"] == "review"


def test_invented_number_is_flagged(make_lecture):
    notebook = GOOD_NOTEBOOK + "\nלפי מחקר משנת 1987, היבול עלה ב-73%.\n"
    unsupported = run_quality_checks(make_lecture(notebook))["numbers"]["unsupported"]
    assert sorted(item["value"] for item in unsupported) == ["1987", "73"]
    assert "1987" in next(item["context"] for item in unsupported if item["value"] == "1987")


def test_number_only_in_earlier_ai_summary(make_lecture):
    notebook = GOOD_NOTEBOOK + "\nבהרצאה הקודמת ראינו 512 זנים.\n"
    lecture = make_lecture(notebook, prior_summary="# סיכום\nיש 512 זנים של עגבניות.")
    numbers = run_quality_checks(lecture)["numbers"]
    assert numbers["unsupported"] == []
    assert [item["value"] for item in numbers["only_in_ai_context"]] == ["512"]


def test_report_file_has_prompt_version_and_notes(make_lecture):
    lecture = make_lecture()
    write_quality_report(lecture)
    report = json.loads((lecture / REPORT_FILENAME).read_text(encoding="utf-8"))
    # no job_status and no pipeline.log draft line in the fixture
    assert report["prompt_version"] == "unknown"
    assert report["prompt_version_inferred"] is True
    assert any("Whisper" in note for note in report["notes"])
    assert "Quality report: ok" in (lecture / "pipeline.log").read_text(encoding="utf-8")


# ---------- Hebrew word matching ----------


def test_prefix_letters_are_ignored():
    index = _word_index("והממשלה החליטה")
    assert _word_found("ממשלה", index)
    assert _word_found("הממשלה", index)
    assert _word_found("החליטה", index)


def test_short_stems_do_not_collide():
    # cutting two letters from ממשלה gives שלה ("hers"), which must not count as a match
    assert not _word_found("ממשלה", _word_index("זה הספר שלה"))


def test_slide_keywords_skip_stopwords_and_short_words():
    assert slide_keywords("והוא של את הקרקע זה עם ים") == ["הקרקע"]


def test_english_slides_are_not_judged_against_hebrew_notebook():
    slides = [
        {"file": f"p{i}.png", "pdf": "presentation.pdf", "page": i, "preview": "", "text": f"Ethics of data topic number {i} explained"}
        for i in range(6)
    ]
    coverage = check_slide_coverage(slides, "מחברת בעברית בלבד על אתיקה של מידע")
    assert coverage["slides_other_language"] == 6
    assert coverage["score"] is None


def test_footer_words_are_not_counted_as_missing():
    slides = [
        {"file": f"p{i}.png", "pdf": "presentation.pdf", "page": i, "preview": "", "text": f"{topic} כל הזכויות שמורות למרצה"}
        for i, topic in enumerate(["קומפוסט ביתי משובח", "השקיה חכמה בטפטוף", "חיפוי קרקע בקש", "דבורים ופרחים בגינה", "ערוגות מוגבהות גבוהות"])
    ]
    notebook = "קומפוסט ביתי משובח. השקיה חכמה בטפטוף. חיפוי קרקע בקש. דבורים ופרחים בגינה. ערוגות מוגבהות גבוהות."
    coverage = check_slide_coverage(slides, notebook)
    assert coverage["uncovered"] == []
    assert "הזכויות" in coverage["boilerplate_words"]


# ---------- number extraction ----------


def test_numbers_skip_list_numbering_headings_images_and_small_values():
    notebook = (
        "## 12. כותרת\n"
        "1. פריט עם 3 דברים\n"
        "![x](./extracted_images/page_045.png)\n"
        "בשנת ב2008 נמכרו 1,500 יחידות, $\\frac{1}{20}$\n"
    )
    assert sorted(_notebook_numbers(notebook)) == ["1500", "20", "2008"]


def test_thousands_separator_matches_source(make_lecture):
    notebook = GOOD_NOTEBOOK + "\nנשתלו 1,500 שתילים.\n"
    lecture = make_lecture(notebook)
    transcript = lecture / "transcripts" / "raw_transcript.txt"
    transcript.write_text(transcript.read_text(encoding="utf-8") + " נשתלו 1500 שתילים", encoding="utf-8")
    assert run_quality_checks(lecture)["numbers"]["unsupported"] == []
