---
change_id: code-review-evals
title: Definition of Done and promptfoo evals for the review agent
status: planned
created: 2026-11-21
updated: 2026-11-21
archived_at: null
---

## Notes

Add a Definition of Done for pull requests (context/team/definition-of-done.md, derived from the six review criteria, project conventions and a pass threshold) and a promptfoo eval suite in packages/code-reviewer/evals that runs the real review agent (custom file:// provider with the ReviewResult schema) on 3 models side by side, with a few diff fixtures that have known flaws plus one clean diff. Assertions: static verdict/score checks and llm-rubric (LLM-as-judge) checking the review names the planted flaws. The suite doubles as a regression gate before prompt changes. M5L3 task 3. OpenRouter account has no credits, so only free models for now.
