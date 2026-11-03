# Scripts

One-off maintenance scripts. Run them from the project root with the backend venv, e.g.:

```bash
backend/.venv/Scripts/python.exe scripts/export_course_combined_pdf.py "course name"
```

Every script supports `--help`.

| Script | What it does | Gemini calls (costs money) |
| --- | --- | --- |
| `export_all_courses_pdfs.py` | PDF ZIP per course → `~/Downloads/SmartNote_Exports` | no |
| `export_course_combined_pdf.py` | Two combined PDFs for one course (notebooks + exam summaries) | no |
| `regenerate_exam_summaries.py` | Rebuild `exam_summary.md` for every lecture in a course + combined PDF | **yes — 1 per lecture** |
| `retry_course_ai.py` | Re-run AI editing + assembly for all lectures in a course | **yes — 2 per lecture** |
| `augment_notebook_sections.py` | Add summary/placement/exam sections to existing notebooks (`--dry-run` available) | **yes** |
