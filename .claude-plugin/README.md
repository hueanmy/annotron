# 🎯 Annotron - AI Artifact Review & Feedback

## What is Annotron?

Annotron is a **browser-based annotation editor** for reviewing AI-generated artifacts. 

Instead of:
- ❌ Describing feedback in prose
- ❌ Copy-pasting changes
- ❌ Squinting at raw markdown
- ❌ Waiting 15-30 seconds per feedback loop

You:
- ✅ Click the text you want to change
- ✅ Type your feedback
- ✅ Hit "Send"
- ✅ See results in 3-5 seconds (no copy-paste, no manual steps)

**That's loop engineering for artifacts.**

---

## 🚀 Quick Start

### Terminal
```bash
npm install -g annotron
annotron architecture.md --agent
```

### VS Code
Right-click any `.md` or `.html` file → **Open in annotron**

### Web
Visit [annotron.io](https://annotron.io) (coming soon)

---

## ✨ Key Features

### 🎯 Point-and-Click Annotations
- Click any text or element to comment
- No prose descriptions needed
- Comment box pops up instantly

### 📐 Beautiful Rendering
- Markdown renders to professional HTML
- NOT raw source code (hard to read)
- Code blocks syntax-highlighted
- Tables properly formatted
- Images embedded

### 📊 7+ Diagram Types
Automatic rendering of Mermaid diagrams:
- Flowcharts
- Sequence diagrams
- Class diagrams
- ER diagrams
- C4 architecture
- Gantt charts
- Git graph

### 📝 Structured Feedback
Each annotation captures:
- **CSS Selector** (exact element)
- **Text Content** (what you selected)
- **Your Note** (what to change)
- **Images** (mockups, references)

No ambiguity. Agent understands immediately.

### ⚡ Live Feedback Loops
1. Click text
2. Type feedback
3. Hit "Send"
4. Agent applies changes in 3-5 seconds
5. Browser reloads automatically
6. See results live
7. Repeat until perfect

### 🔄 Live Activity Mirror
Watch the agent work in real-time:
- Read operations
- File edits
- Bash commands
- Progress updates

All streaming in the sidebar.

### 📚 History & Threads
- Browse all past feedback rounds
- Reply to annotations
- Threaded conversations
- Track changes over time

### 💾 Markdown Editor
- Edit source directly
- Real-time preview
- Save with ⌘/Ctrl+S
- Changes reflect instantly

### 🎁 Finalize & Download
- Clean up the artifact
- Remove annotation metadata
- Download polished result
- Ready to share

---

## 💰 The Real Win: Zero Token Cost

✅ **Local-only** — Runs on your machine  
✅ **No cloud** — No external API calls  
✅ **No token overhead** — No LLM cost for saves/renders  
✅ **No subscription** — Free forever  

Everything stays on your machine. Your data is yours.

---

## 📖 Use Cases

### Architecture Documents
Review agent-generated architecture docs with live diagrams

### API Documentation
Iterate on generated API specs and docs

### Tech Specs & RFCs
Provide feedback on technical designs

### Generated Code Comments
Refine agent-written documentation

### PRDs & Requirements
Get agent-generated requirements right before shipping

### Markdown Artifacts
Any `.md` file your agent generates

---

## 🎬 How It Works (Step-by-Step)

### Step 1: Open Your Markdown File
```bash
annotron document.md --agent
```

The Markdown automatically renders to HTML in your browser.
Diagrams render as SVG. Outline sidebar appears.

### Step 2: Spot What Needs Fixing
You see the rendered document (beautiful, readable).
Not raw markdown (messy, hard to parse).

### Step 3: Click the Text You Want to Change
A comment box pops up instantly.

### Step 4: Type Your Feedback
"Add more examples" or "Fix this explanation" or "Make this clearer"

You can also attach an image if you want to show a mockup.

### Step 5: Hit "Send Feedback"
Annotron captures:
- Exact CSS selector (which element)
- Text content (what you selected)
- Your note (what to change)
- Images (optional reference)

### Step 6: Watch It Happen
In the background, the agent loop listens.
It receives your structured feedback.
Claude Code applies the changes.

You see live activity in the sidebar:
- "Reading file..."
- "Applying edit..."
- "Saving..."

### Step 7: See Results Instantly
Your browser reloads.
Changes appear live (rendered HTML, not raw markdown).

Everything happens in **3-5 seconds**.

No waiting. No manual copying. No context-switching.

### Step 8: Repeat or Finalize
See something else?
Click again. Type feedback. Send.
Another 3-5 seconds.

Want to edit the source directly?
Use the Markdown editor on the side. Save with Ctrl+S.

When you're done:
Hit "Finalize" to clean up metadata.
Download the polished artifact.

---

## 🔗 Installation

### npm (Global CLI)
```bash
npm install -g annotron
```

Then use:
```bash
annotron artifact.html              # Open in browser
annotron artifact.md --agent        # Open + start feedback loop
annotron agent artifact.md          # Run agent loop separately
annotron poll artifact.md           # Wait for feedback
annotron stop                       # Shut down server
```

### VS Code Extension
- Install: "Annotron" from VS Code Marketplace
- Right-click `.md` or `.html` → "Open in annotron"
- Set `annotron.autoAgent: true` to auto-start feedback loop

### OpenVSX (VS Code Forks)
For VS Code forks and alternative IDEs: [open-vsx.org](https://open-vsx.org/extension/hueanmy/annotron)

---

## 🎓 Learn More

- 📚 [Full Documentation](https://github.com/hueanmy/annotron)
- 🎥 [Video Demo](https://www.youtube.com/@studyingwithmeii)
- 💬 [GitHub Issues & Discussions](https://github.com/hueanmy/annotron/issues)
- 🛠️ [Contributing Guide](https://github.com/hueanmy/annotron/CONTRIBUTING.md)

---

## ⚙️ Requirements

- **Node.js 16+**
- **macOS, Linux, or Windows**
- **Modern browser** (Chrome, Firefox, Safari, Edge)
- **50MB disk space**
- **Local network** (127.0.0.1 loopback, no internet required)

---

## 🤝 Community

Have ideas? Found a bug? Want to contribute?

- [GitHub Issues](https://github.com/hueanmy/annotron/issues)
- [GitHub Discussions](https://github.com/hueanmy/annotron/discussions)
- [GitHub Pull Requests](https://github.com/hueanmy/annotron/pulls)

---

## 📄 License

MIT License — Use freely, modify, distribute.
See [LICENSE](https://github.com/hueanmy/annotron/LICENSE)

---

## 🙏 Made With ❤️

For everyone tired of copy-paste feedback loops with AI agents.

**Annotron: Loop engineering for artifacts.**

---

### Next Steps

1. **Try it**: `npm install -g annotron`
2. **Open a file**: `annotron test.md --agent`
3. **Annotate**: Click text → send feedback
4. **Watch it work**: See changes in 3-5 seconds
5. **Share your feedback**: [Issues](https://github.com/hueanmy/annotron/issues)

Happy annotating! 🚀
