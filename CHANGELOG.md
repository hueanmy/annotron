# Changelog

## [Unreleased]

### Added
- **Reviewer identity on comments** — comments now record and show *who* wrote them. A new `GET /whoami` resolves the reviewer from the GitHub login (`gh api user`), falling back to `git config user.name` / `user.email`, then `user@hostname`. The server stamps `author` + `authorDetail` onto each annotation and human thread message in the sidecar, and the sidebar renders the name, a colored initials avatar, and the email/host as a tooltip.

### Changed
- **Editor redesign** — reimplemented the review chrome and in-artifact overlays in a new light design system (imported from the Claude Design `Annotron.dc.html` project): Inter + Petrona typography, a `#2741F1` accent palette, rounded cards and soft shadows. Comment cards now show an avatar, author, relative time, kind tag, quoted selection, and threaded agent replies, with **Resolve/Reopen** and inline **Reply**. Selecting text (or clicking an element in Annotate mode) opens a "New comment" composer **inline in the artifact, anchored right below the selection/element**; on submit the comment lands in the sidebar as a pending card. The sidebar gains **Annotations / History** tabs with a timeline, and a toast surfaces actions. All backend wiring is unchanged — SSE live reload/activity mirror, long-poll feedback, sidecar annotations & threads, serialize/finalize/download, image upload, remote permission approval, and cancel all work as before. The dark theme and its toggle were removed in favor of the single light design.

### Fixed
- **Annotation cards collapse in later review turns** (issue #79): the sidebar annotation list (`#annotations-list`) is a flex column, and each `.ann-card` used `overflow: hidden`, which disables a flex item's automatic minimum size. Once enough saved annotations accumulated to fill the sidebar, every card (and the pending-selection card) was squeezed into an unreadable 1px sliver instead of the list scrolling — so on turn 2 neither old nor new annotations were visible. Cards and the section label now use `flex-shrink: 0`, so they keep their natural height and the list scrolls.

## [0.6.0] - 2026-07-14

### Added
- **Live CLI activity mirror**: bundled `PostToolUse`/`PreToolUse` hooks stream every tool call (Read/Edit/Write/Bash/Grep/…) into the browser sidebar as CLI-like steps — the reviewer now sees what the agent is doing in real time instead of a bare "Agent …" indicator, with no manual `annotron progress` calls.
- **Turn-status bar**: a status pill shows `Agent working…` / `Waiting for your feedback` / `Needs your permission`, driven by `Notification` (idle/permission) and `Stop` hooks — fixes the "CLI still running but browser looks idle" confusion.
- **Remote permission approval**: a *Remote approve* toggle in the browser routes Claude Code permission prompts to the review UI. A `PreToolUse` hook blocks the tool, shows an **Allow / Allow-always / Deny** card in the sidebar, and returns the decision to the CLI. `Allow always` auto-approves that tool for the rest of the session. Falls back to the terminal prompt if the browser doesn't answer within ~170s.
- **New endpoints**: `POST /hook/pretool` (mirror + cancel + permission gate), `POST /hook/posttool`, `POST /hook/notify`, `POST /hook/stop`, `POST /permission/decision`, `POST /permission/mode`.
- **Generic bridge hook** `hooks/annotron-hook.sh` (`gate`/`fire` modes) replaces the cancel-only hook; `hooks.json` now wires PreToolUse/PostToolUse/Notification/Stop.

### Changed
- Cancellation enforcement moved into the consolidated `/hook/pretool` path (still deny-on-next-tool). annotron's own CLI calls are exempted server-side via a precise command match (robust to escaped quotes and to working directories whose path contains "annotron").
- Server tracks per-session `remoteApprove`, `autoAllowTools`, and pending permission waiters.

## [0.5.0] - 2026-07-10

### Added
- **Image attachments everywhere** (issue #2): paste an image directly into the message box — or into any annotation's **reply** box or a pending annotation's **note** box — or click 🖼️ to upload files. Thumbnails preview with per-image remove. On send, images are saved to `.annotron-uploads/` beside the artifact and their absolute paths are included in the feedback so the agent can `Read` them. Per-annotation images ride along in that item's `images[]`; composer images are top-level.
- **Copy agent messages** (issue #2): agent replies in the conversation log and in annotation threads now have a small **Copy** button. (Artifact text remains selectable/copyable with Annotate mode off.)
- **Live step log** (issue #2): instead of a bare "Agent …" indicator, the agent's actual steps stream into the sidebar like a CLI. Each step shows with a `›` marker and is checked off (`✓`) as the next one starts.
- **Cancel current work** (issue #2): a **Cancel** button appears while the agent is working. Clicking it requests cancellation — the agent stops and reports what it did/didn't finish.
- **Automatic cancel enforcement via a bundled `PreToolUse` hook** (issue #2): the plugin now ships `hooks/hooks.json` + `hooks/annotron-cancel-check.sh`, active on install with no per-project setup. When a review is cancelled, the agent's next tool call (Edit/Write/Read/Bash — except `annotron` commands, which stay allowed so it can report back) is denied, so it stops at the next tool boundary without relying on it to poll. The hook is a no-op (fails fast, ~19ms) when the server isn't running.
- **`GET /cancel-check`**: fileless endpoint the hook queries — returns `{cancelled:true, file}` only when some session is both actively working and cancelled. Server now tracks a per-session `working` flag (set when a poll hands the agent a round, cleared on reply/finalize).
- **`POST /upload`**: accepts a base64 image data URL for a registered file, writes it to `.annotron-uploads/`, and returns the saved path (20MB limit).
- **`POST /agent-progress`**: broadcasts an `agent-progress` SSE event carrying a step string.
- **`POST /cancel` and `GET /cancelled`**: request/query cooperative cancellation for a session.
- **`annotron progress <file> "step"`**: CLI command for the agent to post a live progress step.
- **`annotron check <file>`**: CLI command that prints `{"cancelled":true|false}` so the agent can honor a mid-flight cancel.

### Changed
- Feedback payload now includes an `images[]` array (`{name, path}`); the skill instructs the agent to `Read` each path.
- The `agent-thinking` indicator now drives a persistent "working" bubble that hosts the step log and is dismissed on `agent-reply` or `agent-cancelled`.
- SSE reconnect no longer wipes the working indicator, so steps survive brief drops.

## [0.4.0] - 2026-06-30

### Added
- **Annotation persistence**: every annotation is saved to a sidecar JSON file (`artifact.annotron.json`) beside the HTML, surviving server restarts and page reloads
- **Thread UI per annotation**: each annotation card in the sidebar shows the full conversation thread (human notes + agent replies) — reply inline per annotation without leaving the context
- **Click annotation to jump**: clicking an annotation card header scrolls to and highlights the corresponding element in the preview iframe
- **Annotations restored on load**: previously created annotations are loaded from the sidecar on startup, so all past context is preserved
- **History tab**: sidebar now has an Annotations tab and a History tab — the History tab lists past feedback rounds with timestamps and annotation counts
- **`GET /annotations` and `POST /annotations` endpoints**: read/write the sidecar JSON for any registered file
- **Targeted agent replies**: `annotron poll <file> --reply "…" --annotation-id <id>` posts the reply to a specific annotation's thread
- **`jump-to-element` and `clear-highlight` postMessage handlers in SDK**: chrome can programmatically scroll and highlight elements in the artifact iframe

### Changed
- Sidebar redesigned with tab navigation (Annotations / History), replacing the single flat conversation log
- Sending feedback now reloads annotation state from server to reflect server-assigned IDs
- `agent-reply` SSE event now carries `annotationId` when the reply targets a specific annotation; chrome updates that card's thread instead of the general conversation log
- `/agent-reply` endpoint accepts optional `annotationId` — appends reply to that annotation's thread in the sidecar
- `/feedback` endpoint assigns real IDs to new annotations and reflects them back in the poll payload

## [0.3.0] - 2026-06-30

### Added
- **Agent thinking indicator**: three animated dots appear in the sidebar conversation log immediately after the user sends feedback, so there is clear visual feedback that the agent received the message and is processing it
- **Enter to send**: pressing Enter in the message composer now submits feedback; Shift+Enter inserts a newline (matches chat-app UX)
- **First-time permission setup**: skill now prompts the user to add annotron commands to `.claude/settings.json` on first use, eliminating per-command approval prompts
- **`agent-thinking` SSE event**: server broadcasts this event the moment feedback is POSTed, so the browser can show the thinking indicator without waiting for the agent to poll

### Changed
- Inline annotation card rebuilt without Shadow DOM — direct DOM with inline styles; works reliably inside sandboxed iframes across all browsers
- `set-annotate` message sent unconditionally (removed `sdkReady` guard) so annotate mode activates correctly even when the extension reloads the iframe
- `chrome.html` served with `Cache-Control: no-store` to prevent the browser from serving a stale version after updates
- SDK is re-read from disk on every artifact request — changes to `sdk.js` take effect without restarting the server
- Thinking indicator uses a `data-thinking` attribute instead of a closure reference so it is correctly removed even when the SSE connection drops and reconnects

### Fixed
- Floating annotation card was invisible in sandboxed iframes (Shadow DOM incompatibility) — removed Shadow DOM entirely
- Annotate mode silently did nothing if the SDK frame reloaded (e.g. due to Grammarly) before the user clicked the Annotate button
- Thinking dots stayed on screen permanently after an SSE reconnect

## [0.2.0] - 2026-06-30

### Added
- **Inline annotation card**: clicking an element or selecting text now opens a floating card directly next to the target — no need to look at the sidebar to type a note
- **Text highlight**: selected text is highlighted in-place while the inline card is open
- **Shadow DOM isolation**: the inline card is rendered in a Shadow DOM overlay so it is never affected by the artifact's own CSS

### Changed
- Annotations now carry the note from the inline card — sidebar cards appear pre-filled instead of empty
- Interactive elements (checkboxes, radios, buttons, inputs, links, labels) are no longer intercepted in annotate mode, so they can be clicked normally
- SDK is read from disk on each request instead of once at server start, so edits take effect without restarting the server

### Fixed
- Checkboxes and other form controls could not be interacted with while annotate mode was on
- Selecting text and then releasing the mouse could create two cards (one text, one element) — the `ignoreNextClick` guard now prevents this

## [0.1.0] - 2026-06-29

### Added
- Initial release
- Local browser-based review editor for agent-generated HTML artifacts
- Annotate mode: click elements or select text to create feedback cards
- Sidebar conversation log with agent reply support
- Finalize: write reviewed artifact back to disk
- Download: save clean HTML without annotron tooling
- Dark / light mode toggle
- Keyboard shortcuts (A, D, T, Ctrl+Z, Ctrl+Enter, ?)
- Undo card removal (with toast)
- Live reload via SSE when the agent edits the file
- Claude Code skill and slash command included in the npm package
