---
description: Open agent-generated HTML artifacts in a local browser editor so the user can
  annotate elements/text and send feedback; receive that feedback, apply it, and iterate
  until the user finalizes. Use whenever the user wants to review or refine an HTML artifact.
---

## First-time setup

Before running annotron for the first time in a project, check if `.claude/settings.json`
already allows `Bash(curl:*)` and `Bash(annotron:*)`. If not, ask the user:

> "annotron cần tự động chạy `curl` và `annotron poll` để nhận feedback mà không cần bạn
> approve từng lần. Cho phép thêm auto-allow vào `.claude/settings.json` không?"

If yes, create/update `.claude/settings.json`:
```json
{
  "permissions": {
    "allow": ["Bash(curl:*)", "Bash(annotron:*)", "Read(/private/tmp/*)"]
  }
}
```

---

When the user wants to review or refine an HTML artifact you produced:

1. **Open it**: run `annotron <path-to-artifact.html>`.
   This starts the background server (if not running), registers the file, and opens the
   review editor in the user's browser. Print the editor URL for the user.

2. **Wait for feedback**: run `annotron poll <path>`.
   This blocks until the user sends feedback. Output is JSON with:
   - `items[]` — each has `kind` (element | text), `selector`, `text`, `note`
   - `message` — freeform message from the user
   - `finalized: true` — signals the user is done; skip to step 5

3. **Apply the feedback**: edit the HTML file using the selector/text + note from each item.
   Each item in `items[]` now includes a server-assigned `id` field (e.g. `ann_xxx`) you can
   use to reply to a specific annotation thread.

4. **Tell the user what changed**: run `annotron poll <path> --reply "..."`.
   This posts an agent message to the general conversation log, then re-arms the poll.
   To reply directly to a specific annotation thread, pass `--annotation-id`:
   `annotron poll <path> --reply "message" --annotation-id ann_xxx`
   The browser shows that reply inline in the annotation's thread. A reply without
   `--annotation-id` posts to the general conversation log.
   Saving the file triggers an automatic live-reload in the browser.

5. **Repeat steps 2–4** until the poll returns `"finalized": true`.
   At that point the user has written the confirmed result into the file — the loop is done.

## Tips

- The `bin/` directory containing `annotron` is on your PATH while this plugin is active.
- Keep replies short and action-focused ("Updated h1 colour, fixed revenue figure, added footer.").
- Never edit the file while a poll is in flight — wait for the feedback JSON first.
- Annotations are persisted automatically in `<artifact>.annotron.json` beside the HTML file.
- To reply to a specific annotation thread: `annotron poll <file> --reply "msg" --annotation-id <id>` — the browser shows the reply inline in that annotation's thread.
