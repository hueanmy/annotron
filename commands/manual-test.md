---
description: Open MANUAL-RESULTS.md for an epic in annotron and run the manual-test result-capture loop (Pass/Fail/N/A + Notes + metadata edits, syncing back to TEST-CASES/).
---

Open the epic's MANUAL-RESULTS.md (generating it from `TEST-CASES/*.md` if it
doesn't exist yet) in the annotron review editor and run the full manual-test
loop:

1. `annotron-mr gen <artifactsDir>` — build / refresh MANUAL-RESULTS.md from the
   per-feature TEST-CASES/ files (preserves prior Result/Notes).
2. `annotron-mr render <MANUAL-RESULTS.md>` — render the HTML with editable
   Pass/Fail/N/A dropdowns + textareas for every column except TC ID.
3. `annotron-mr autosave <artifactsDir> &` — start the background disk-autosave
   server (5-minute interval; in-page buttons flush immediately).
4. `annotron <MANUAL-RESULTS.html>` — open the editor in the browser.
5. `annotron poll <MANUAL-RESULTS.html>` — wait for feedback (edits, chat
   messages asking to add / remove / edit test cases, or Finalize).
6. Dispatch feedback: apply structural edits to `TEST-CASES/<feature>.md` (and
   `TEST-PLAN.md` when relevant), regen, re-render, reply. Loop until Finalize.
7. `annotron-mr save <html> <md>` — final full sync (MANUAL-RESULTS.md + patched
   `TEST-CASES/`). Kill autosave server. `annotron stop`.

See `skills/manual-test/SKILL.md` for the full protocol.
