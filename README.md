# annotron

Local, browser-based review editor for **agent-generated HTML artifacts** — annotate elements and text, attach images, watch the agent work live, approve tool permissions, send feedback to your AI coding agent, then finalize the result into the file and download it.

## Demo

[![annotron in action](docs/annotron-demo.gif)](docs/annotron-demo.mp4)

Comment on any text selection or element with an inline composer, hover a highlight to preview its note, send feedback and watch the agent's activity stream in live, then browse past rounds in **History**. ▶︎ [Watch the full-quality video](docs/annotron-demo.mp4)

## The problem

Agents (Claude Code, etc.) produce rich HTML plans, diagrams, reports, and mockups. Giving feedback by describing what you see in text is clumsy. `annotron` gives you a point-and-click annotation layer directly on the rendered artifact, so the agent gets precise, structured feedback (which element, what text, what to change).

## Features

- **Point-and-click annotations** — comment on any element or text selection; feedback carries the CSS selector, the text, and your note.
- **Image attachments** — paste or upload images into the composer or any annotation reply/note; the agent reads them by path.
- **Live activity mirror** — a bundled hook streams the agent's tool calls (Read/Edit/Bash/…) into the sidebar like a CLI, so you can follow along in real time.
- **Turn-status bar** — always know whose turn it is: *Agent working… / Waiting for your feedback / Needs your permission*.
- **Cancel anytime** — a Cancel button stops the agent at the next tool boundary (enforced by the bundled hook, no per-project setup).
- **Remote permission approval** — optionally route Claude Code permission prompts to the browser and click **Allow / Allow-always / Deny**; the decision goes back to the CLI.
- **Annotation threads & history** — per-annotation conversation threads, persisted to a sidecar file, plus a history tab of past rounds.

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
node bin/annotron artifact.html
```

## Usage

```
annotron <file.html>                    Open the editor in browser
annotron poll <file.html>               Wait for feedback (run by the agent)
annotron poll <file.html> --reply "…"  Post a reply then wait for feedback
annotron progress <file.html> "step"    Post a live progress step (optional; hooks do this automatically)
annotron check <file.html>              Print {"cancelled":true|false} for the session
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
    { "kind": "element", "selector": "body > header", "text": null, "note": "Make this sticky", "images": [] },
    { "kind": "text", "selector": "body > p", "text": "lorem ipsum", "note": "Match this mockup",
      "images": [{ "name": "mockup.png", "path": "/…/.annotron-uploads/…_mockup.png" }] }
  ],
  "message": "Also please add a footer.",
  "images": []
}
```

Each `images[]` entry has a `name` and an absolute `path` — `Read` the path to view the image.

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
- **Structured feedback** — each annotation carries a kind (`element` | `text`), a CSS selector, the selected text, a freeform note, and any attached images.
- **Hook-powered mirror & control** — the plugin ships `PreToolUse`/`PostToolUse`/`Notification`/`Stop` hooks that stream activity, enforce cancellation, and (opt-in) gate tool permissions through the browser. They are no-ops (fail fast) when the server isn't running.
