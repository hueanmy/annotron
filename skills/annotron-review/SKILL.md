---
description: Open agent-generated HTML artifacts in a local browser editor so the user can
  annotate elements/text and send feedback; receive that feedback, apply it, and iterate
  until the user finalizes. Use whenever the user wants to review or refine an HTML artifact.
---

When the user wants to review or refine an HTML artifact you produced:

1. Open it: run `annotron <path-to-artifact.html>`. This opens the editor in their browser.
2. Wait for feedback: run `annotron poll <path>`. It blocks and returns JSON describing the
   user's feedback — each item has a `kind` (element | text | message), a `selector`, the
   selected `text`, and the user's `note`.
3. Apply each item to the HTML file using its selector / text + note.
4. Tell the user what you changed: `annotron poll <path> --reply "..."` (also re-arms the poll).
   Saving the file makes the editor live-reload automatically.
5. Repeat 2–4 until the poll returns `"finalized": true` — the user has written the
   confirmed result into the file and is done.
