---
description: Open MANUAL-RESULTS.md for an epic in annotron and run the manual-test result-capture loop (Pass/Fail/N/A + Notes + metadata edits, syncing back to TEST-CASES/).
---

Open the epic's MANUAL-RESULTS.md in the annotron review editor and run the full
manual-test loop:

1. `annotron-mr gen <artifactsDir>` — always run unconditionally: scans
   `TEST-CASES/*.md`, writes/merges MANUAL-RESULTS.md. Existing Result/Notes are
   preserved; new cases are appended with `Result=Untested`.
2. `annotron-mr render <MANUAL-RESULTS.md>` — render the HTML with editable
   Pass/Fail/N/A dropdowns + textareas for every column except TC ID.
3. `annotron-mr autosave <artifactsDir> &` — start the background disk-autosave
   server. Edits land on disk within ~1s via debounce; the in-page **💾 Save now**
   button flushes immediately.
4. `annotron <MANUAL-RESULTS.html>` — open the editor in the browser.
5. `annotron poll <MANUAL-RESULTS.html>` — wait for feedback (edits, chat
   messages asking to add / remove / edit test cases, or Finalize).
6. Dispatch feedback: apply structural edits to `TEST-CASES/<feature>.md` (and
   `TEST-PLAN.md` when relevant), regen, re-render, reply. Loop until Finalize.
7. Kill autosave server first (so its SIGTERM handler flushes pending writes),
   then `annotron-mr commit-md <MANUAL-RESULTS.md>` — propagate metadata changes
   to `TEST-CASES/`. `annotron stop`.

See `skills/manual-test/SKILL.md` for the full protocol.
