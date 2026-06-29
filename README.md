# annotron

Local, browser-based review editor for **agent-generated HTML artifacts** — annotate elements and text, send feedback to your AI coding agent, then finalize the result into the file and download it.

## The problem

Agents (Claude Code, etc.) produce rich HTML plans, diagrams, reports, and mockups. Giving feedback by describing what you see in text is clumsy. `annotron` gives you a point-and-click annotation layer directly on the rendered artifact, so the agent gets precise, structured feedback (which element, what text, what to change).

## Core loop

```
agent writes artifact.html
        │
        ▼
annotron artifact.html        → opens the review editor in your browser
        │
        ▼
you turn on Annotate, click elements / select text, write notes → Send feedback
        │
        ▼
annotron poll artifact.html   → agent receives feedback JSON, edits the file, replies
        │
        ▼
file changes → editor live-reloads (repeat until both agree)
        │
        ▼
Finalize → clean result written into the file
Download → clean HTML saved to your machine
```

## Install

```bash
npm install -g annotron
```

Or run directly from the repo:

```bash
git clone https://github.com/hueanmy/annotron
cd annotron
node bin/cli.js artifact.html
```

## Usage

```
annotron <file.html>                    Open the editor in browser
annotron poll <file.html>               Wait for feedback (run by the agent)
annotron poll <file.html> --reply "…"  Post a reply then wait for feedback
annotron stop                           Shut down the background server
annotron help                           Show help
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANNOTRON_PORT` | `7321` | Server port |
| `ANNOTRON_HOST` | `127.0.0.1` | Server bind host |

> **Security note:** The server is bound to loopback (`127.0.0.1`) by default. Binding beyond loopback via `ANNOTRON_HOST` exposes an **unauthenticated** server that can read and write any registered file. Only do that on a fully trusted network.

## Agent workflow (Claude Code)

```bash
# 1. Open the artifact
annotron plan.html

# 2. Wait for human feedback (agent side)
annotron poll plan.html

# 3. Feedback arrives as JSON → apply changes, reply
annotron poll plan.html --reply "I updated the color scheme and moved the nav to the top."
```

The poll output looks like:

```json
{
  "items": [
    { "kind": "element", "selector": "body > header", "text": null, "note": "Make this sticky" },
    { "kind": "text", "selector": "body > p", "text": "lorem ipsum", "note": "Replace with real copy" }
  ],
  "message": "Also please add a footer."
}
```

## Claude Code plugin

This repo includes a Claude Code plugin that teaches Claude Code *when and how* to drive `annotron`:

```text
/plugin marketplace add hueanmy/annotron
/plugin install annotron@meii-marketplace
```

After install, `/annotron` triggers the review loop automatically.

## How it works

- **Zero runtime dependencies** — Node built-ins only (`http`, `fs`, `crypto`, `path`, `url`).
- **Disk file stays clean** — the SDK is injected only at serve time; it's never written to your file.
- **Local-only** — server binds to `127.0.0.1`. No cloud, no accounts.
- **Live reload** — file changes are detected by content-hash polling; the browser reloads with scroll position preserved.
- **Structured feedback** — each annotation carries a kind (`element` | `text`), a CSS selector, the selected text, and a freeform note.
