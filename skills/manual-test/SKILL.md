---
description: Human-in-the-loop manual-test result capture for an epic. Generates
  MANUAL-RESULTS.md from TEST-CASES/*.md, opens it in annotron with per-row
  Pass/Fail/N/A dropdowns + editable Description/Preconditions/Steps/Expected/Notes
  fields, and syncs results back to the .md. Mid-run the user can send chat
  messages / row annotations asking to add/remove/edit test cases — those flow
  into TEST-CASES/<feature>.md (and TEST-PLAN.md when relevant), then
  MANUAL-RESULTS is regenerated in place. Invoke via /manual-test <epic>. Use
  when the user wants to record manual-test outcomes so a later test report can
  aggregate them alongside auto-test results.
---

# /manual-test — record manual results via annotron

Companion to `/annotron-review`. Same MD-canonical model, but the artifact is a
single **MANUAL-RESULTS.md** (one table for every test case in the epic) and the
user edits per-row form controls: `Result` (Pass/Fail/N/A/Untested), `Notes`, and
optionally the metadata columns (Description, Preconditions, Steps, Expected,
Priority, Feature).

Tools (installed alongside annotron on user's PATH):
- `annotron-mr` — the manual-results CLI (subcommands: `gen`, `render`, `save`,
  `autosave`).
- `annotron` — the review editor (already on PATH).

**One rule:** the `.md` is canonical, the `.html` is a throwaway render. All
user choices flow back into the `.md` via the `save` subcommand or the in-page
Save / Commit buttons. Never hand-edit the `.html`.

## Arguments

`/manual-test <epic>`
- `<epic>` — epic id, e.g. `LH-50675`. Resolves to `docs/epics/<epic>/artifacts/`.

Paths: `A = docs/epics/<epic>/artifacts`, `MD = $A/MANUAL-RESULTS.md`,
`HTML = $A/MANUAL-RESULTS.html`.

## Loop

1. **Generate / refresh the results file.** `annotron-mr gen "$A"` — scans
   `$A/TEST-CASES/*.md`, collects every row whose first cell matches
   `<PREFIX>-TC-*`, writes/merges `$MD`. New cases start `Result=Untested`,
   existing Result/Notes preserved across regens. Report the count (new +
   preserved) to the user.

2. **Render.** `annotron-mr render "$MD"` — writes `$HTML` with editable form
   controls (every column except TC ID). The renderer mirrors form state into
   DOM attributes on change so serialization captures the current values.

3. **Start the autosave server** (background). `annotron-mr autosave "$A" &` —
   spins up `http://localhost:4477`. The rendered HTML pings it after every edit
   and the server debounces writes to `$MD` (~250ms). Keep the PID so step 6
   can clean up. If port 4477 is taken (`EADDRINUSE`), pick another:
   `annotron-mr autosave "$A" --port=4478 &` — the HTML falls back to
   localStorage-only auto-save if it can't reach the server.

4. **Open annotron.** `annotron "$HTML"` — starts the annotron server if
   needed, prints the editor URL. Tell the user:
   - Click through the Result dropdowns; type into any cell (except TC ID).
   - The sticky Summary bar updates live.
   - Use the in-page **💾 Save now** button to flush edits to `$MD` at will;
     **📥 Commit & sync sources** to also propagate metadata edits back to
     `TEST-CASES/<feature>.md`.
   - When done marking, click **Finalize** (or type `done` / `xong` and Send)
     to snapshot the current state and end the loop.

5. **Wait — and dispatch.** `annotron poll "$HTML"` — blocks until the user
   sends. The poll returns `{ items[], message, finalized }`. Classify:

   **(a) End signal** — `finalized: true`, OR `message` alone is `done` /
   `xong` / `finalize` / `close` / `stop` with no `items`. Go to step 6.

   **(b) Test-case edit request** — a `message` (or `items[].note`) that asks
   for structural changes: add a case, remove a case, rename, change
   priority/description/steps/expected, split, merge, or update TEST-PLAN.md.
   Handle it:
   - Locate the target file(s): feature file `$A/TEST-CASES/<feature>.md` or
     `$A/TEST-PLAN.md`. Ambiguous — reply asking which feature file to edit,
     then re-arm poll.
   - Apply the edit to the source file(s). Follow the surrounding table format
     exactly (same columns, same TC-ID prefix scheme, `⬜` for new Status
     cells). If adding a case, use the next unused TC number in that prefix.
   - Refresh MANUAL-RESULTS: `annotron-mr gen "$A"` — new cases appear with
     `Result=Untested`; removed cases drop out; existing Result/Notes preserved
     for every unchanged TC.
   - Re-render: `annotron-mr render "$MD"` — annotron live-reloads.
   - Reply: `annotron poll "$HTML" --reply "<short summary — files touched +
     case counts delta>"`. Then re-arm (loop back to step 5).

   **(c) Row note / trivia** — an `items[]` note that reads like an in-place
   comment on a case ("check this on Windows too", "flaky, retry needed"), not
   a structural edit. Append it to the `Notes` cell of that row in `$MD` and
   reply.

   **(d) Neither / unclear** — reply asking the user to clarify. Re-arm.

   Never edit while a poll is in flight — always wait for the JSON first.

6. **Sync back to `.md`.** After Finalize, annotron has written the current
   iframe HTML to `$HTML`. Run:
   - `annotron-mr save "$HTML" "$MD"` — parses form state, updates all columns
     in `$MD`, patches `TEST-CASES/<feature>.md` for any metadata edits,
     regenerates the Summary table.
   - `annotron-mr render "$MD"` — re-render so `$HTML` reflects the persisted
     `.md` (annotron live-reloads).

7. **Report + cleanup.** Reply to the user (via `annotron poll --reply` if the
   server is still up, or a normal turn reply if not) with a one-line summary:
   Pass / Fail / N/A / Untested counts + any TEST-CASES/ files touched. Then:
   - `kill <autosave-pid>` (or `pkill -f "annotron-mr autosave"` as fallback)
     — stop the background autosave server.
   - `annotron stop` — stop annotron.
   Stop.

## Guardrails

- **Editable set**: `$MD`, `$HTML`, `$A/TEST-CASES/*.md`, and `$A/TEST-PLAN.md`.
  Nothing else — no source code, no other artifacts, no sibling epics. If a
  request implies broader work, decline and let the user drive it via a
  different skill.
- **Metadata edits round-trip via `save`/Commit only.** `save` writes all
  columns to `$MD` AND propagates changed metadata columns (description,
  preconditions, steps, expected, priority) back to `TEST-CASES/<feature>.md`.
  If TEST-CASES/ change from elsewhere, re-run `gen` to pull them into `$MD`.
- **Preserve results across regen.** `gen` is idempotent-with-merge: existing
  Result/Notes carry over by TC ID. Renaming a TC ID counts as remove-old +
  add-new (result resets to Untested) — warn the user before doing this.
- **TEST-PLAN.md is prose, not tables.** Structural edits to `$A/TEST-PLAN.md`
  come via chat messages (step 5b), not via the in-page Commit button. The
  Commit response includes a warning listing features referenced in the plan.

## Permissions (optional)

Recommended in `.claude/settings.json`:
- `Bash(annotron:*)` and `Bash(annotron-mr:*)` — the review editor + manual
  results tool.
- `Bash(curl:*)` — poll HTTP endpoints from the skill (if hooks call curl).
- `Edit(docs/epics/**)` and `Write(docs/epics/**)` — write `$MD`, `$HTML`, and
  patched `TEST-CASES/` files.
