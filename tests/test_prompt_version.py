import json
import re

import backend.services.gemini as gemini
from backend.services.prompt_version import (
    PRE_REWRITE_LABEL,
    current_prompt_version,
    get_lecture_prompt_version,
)


def _log(lecture, *lines):
    (lecture / "pipeline.log").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _status(lecture, **fields):
    (lecture / "job_status.json").write_text(json.dumps({"status": "completed", **fields}), encoding="utf-8")


def test_hash_is_short_and_ignores_whitespace(monkeypatch):
    version = current_prompt_version()
    assert re.fullmatch(r"[0-9a-f]{8}", version)
    monkeypatch.setattr(gemini, "SYSTEM_PROMPT", gemini.SYSTEM_PROMPT.replace("\n", "\n\n  "))
    assert current_prompt_version() == version
    monkeypatch.setattr(gemini, "SYSTEM_PROMPT", gemini.SYSTEM_PROMPT + " changed")
    assert current_prompt_version() != version


def test_recorded_version_wins(tmp_path):
    _status(tmp_path, prompt_version="deadbeef")
    _log(tmp_path, "[2026-07-01T10:00:00+00:00] AI draft saved to ai_draft.md (100 chars)")
    assert get_lecture_prompt_version(tmp_path) == {"prompt_version": "deadbeef", "prompt_version_inferred": False}


def test_old_draft_is_pre_rewrite(tmp_path):
    _log(tmp_path, "[2026-07-01T10:00:00+00:00] AI draft saved to ai_draft.md (100 chars)")
    assert get_lecture_prompt_version(tmp_path) == {"prompt_version": PRE_REWRITE_LABEL, "prompt_version_inferred": True}


def test_new_draft_is_current_version(tmp_path):
    _log(
        tmp_path,
        "[2026-07-01T10:00:00+00:00] AI draft saved to ai_draft.md (100 chars)",
        "[2026-09-02T10:00:00+00:00] AI draft saved to ai_draft.md (120 chars)",
    )
    assert get_lecture_prompt_version(tmp_path)["prompt_version"] == current_prompt_version()


def test_rewrite_day_and_missing_line_are_unknown(tmp_path):
    assert get_lecture_prompt_version(tmp_path)["prompt_version"] == "unknown"  # no log at all
    _log(tmp_path, "[2026-07-01T10:00:00+00:00] Pipeline started")
    assert get_lecture_prompt_version(tmp_path)["prompt_version"] == "unknown"
    _log(tmp_path, "[2026-08-25T09:00:00+00:00] AI draft saved to ai_draft.md (100 chars)")
    assert get_lecture_prompt_version(tmp_path)["prompt_version"] == "unknown"


def test_rolled_back_draft_is_ignored(tmp_path):
    # a September reprocess wrote a draft, then failed and restored the July notebook
    _log(
        tmp_path,
        "[2026-07-01T10:00:00+00:00] AI draft saved to ai_draft.md (100 chars)",
        "[2026-09-02T10:00:00+00:00] Old notebook files backed up to backup/20260902-100000",
        "[2026-09-02T10:01:00+00:00] AI draft saved to ai_draft.md (120 chars)",
        "[2026-09-02T10:02:00+00:00] AI-only reprocess failed: boom",
        "[2026-09-02T10:02:01+00:00] Restored previous notebook from backup/20260902-100000",
    )
    assert get_lecture_prompt_version(tmp_path)["prompt_version"] == PRE_REWRITE_LABEL


def test_restore_after_cut_run_keeps_previous_draft(tmp_path):
    # the server died before the new draft was saved; startup restored the old notebook
    _log(
        tmp_path,
        "[2026-07-01T10:00:00+00:00] AI draft saved to ai_draft.md (100 chars)",
        "[2026-09-02T10:00:00+00:00] Old notebook files backed up to backup/20260902-100000",
        "[2026-09-03T08:00:00+00:00] Startup: restored notebook from backup/20260902-100000",
    )
    assert get_lecture_prompt_version(tmp_path)["prompt_version"] == PRE_REWRITE_LABEL
