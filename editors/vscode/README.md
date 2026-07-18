# annotron for VS Code

Right‑click a **`.md`** or **`.html`** file → **Open in annotron** → review it point‑and‑click in your browser.

[annotron](https://github.com/hueanmy/annotron) is a local, browser‑based review editor for agent‑generated artifacts: comment on any element or text selection, watch your AI agent apply changes live, and (for Markdown) render `mermaid` diagrams and sync edits back to the source.

## Usage

- **Explorer / editor context menu** → *Open in annotron* (on `.md` / `.html` files).
- **Command Palette** → `annotron: Open in annotron` (uses the active editor's file).
- `annotron: Stop annotron server` shuts the background server down.

Markdown files render to HTML with inline diagrams (via [merslim](https://www.npmjs.com/package/merslim)); the `.md` stays the source of truth — edit the Markdown pane and **Save** to re‑render.

## Settings

| Setting | Default | Description |
|---|---|---|
| `annotron.port` | `7321` | Port the bundled server listens on (`127.0.0.1`). |
| `annotron.openIn` | `browser` | `browser` (external default browser) or `vscode` (a Simple Browser tab). |

## How it works

The extension bundles annotron and starts it with VS Code's own Node runtime
(`ELECTRON_RUN_AS_NODE`) — **no global install required**. The server renders the
file, injects the review SDK into the browser only, and drives the annotation /
feedback loop. Nothing UI‑related is ever written to disk or sent to your agent.
