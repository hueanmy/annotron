# annotron — Markdown preview, Mermaid diagrams & point‑and‑click review

**Preview Markdown and HTML with live Mermaid diagrams, then click to comment.** Right‑click any `.md` or `.html` file → **Open in annotron** → review it point‑and‑click in your browser: comment on any element or text selection, render `mermaid` diagrams, edit the Markdown source and **Save** to re‑render, and (optionally) drive an AI‑agent feedback loop.

![annotron demo](https://raw.githubusercontent.com/hueanmy/annotron/main/docs/annotron-demo.gif)

## Features

- 📝 **Markdown preview** — render `.md` to a clean, readable document (tables, code, blockquotes, everything).
- 📐 **Mermaid diagrams** — `flowchart`, `sequence diagram`, `class diagram`, `ER diagram`, `C4`, `gantt`, `gitGraph` and more render to **inline SVG** (via [merslim](https://www.npmjs.com/package/merslim)) — no client‑side diagram runtime, perfect for **architecture docs** and **UML**.
- 🖱️ **Point‑and‑click annotation & review** — select text or click an element to comment; each comment carries the exact selector + text, so feedback is precise. Threads, resolve/reply, and reviewer identity (your GitHub account) included.
- 💾 **Two‑way Markdown sync** — edit the Markdown source in a side pane and **Save** (⌘/Ctrl+S) to write it back and re‑render (diagrams included). The `.md` stays the source of truth.
- 🤖 **AI‑agent loop (optional)** — send structured feedback to your coding agent, watch its activity live, and approve tool permissions from the browser.
- 🌐 **HTML too** — review any rendered `.html` artifact the same way.

## Usage

- **Explorer / editor right‑click** → *Open in annotron* (on `.md` / `.html`).
- **Command Palette** → `annotron: Open in annotron` (uses the active editor's file).
- `annotron: Stop annotron server` shuts the background server down.

## Settings

| Setting | Default | Description |
|---|---|---|
| `annotron.port` | `7321` | Port the bundled server listens on (`127.0.0.1`). |
| `annotron.openIn` | `browser` | `browser` (external default browser) or `vscode` (a Simple Browser tab). |

## Why annotron — human‑in‑the‑loop for AI agents

Reviewing agent‑generated docs (PRDs, tech designs, architecture diagrams, mockups) by *describing* changes in prose is slow and lossy. annotron is the **human‑in‑the‑loop** layer for **AI coding agents** (Claude Code, Cursor, …): you **point at exactly what to change**, the agent applies it, and you close the **agent loop** in seconds — precise feedback in, precise edits out. Call it *loop engineering* for docs and artifacts.

## How it works

The extension bundles annotron and starts it with VS Code's own Node runtime
(`ELECTRON_RUN_AS_NODE`) — **no global install required**. The server renders the
file, injects the review UI into the browser only (never to disk, never to your
agent), and drives the annotation / feedback loop.

---

*Keywords: markdown preview, mermaid, mermaid preview, diagram, uml, flowchart, sequence diagram, class diagram, ER diagram, C4, gantt, annotate, review, code review, comment, html preview, architecture docs, AI agent artifacts.*
