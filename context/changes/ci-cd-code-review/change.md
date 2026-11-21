---
change_id: ci-cd-code-review
title: AI code review workflow for pull requests
status: planned
created: 2026-11-21
updated: 2026-11-21
archived_at: null
---

## Notes

Add a GitHub Actions workflow and local composite action that runs the packages/code-reviewer agent on every PR to master, comments the summary, sets ai-cr:passed/ai-cr:failed labels, and supports retry via the ai-cr:review label. Requirements: context/changes/ci-cd-code-review/requirements.md (M5L3).
