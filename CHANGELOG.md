# Changelog

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
