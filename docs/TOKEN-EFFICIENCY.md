# annotron: Zero-Token Loop Engineering

## The Problem: Token Waste in AI Feedback Loops

Every time you give feedback to an AI agent, you're making an API call.

### Current Workflow (Token-Heavy)

```
1. Agent generates artifact (Markdown/HTML)
2. You read it
3. You type feedback: "Change the color to blue, add spacing, move this left"
4. Agent gets prompt → API call → $0.01-0.10
5. Agent applies changes
6. You review → see it's not quite right
7. You type new feedback: "Actually, make it darker blue"
8. Agent gets prompt → API call → $0.01-0.10
9. ... repeat 5-10 times per artifact
10. Total cost per artifact: $0.05 - $1.00+ in tokens alone
```

**Time:** Minutes waiting for each API call
**Cost:** Adds up across projects
**UX:** Context switching, text descriptions, misunderstandings

---

## The Solution: annotron (Zero-Token)

### New Workflow (Token-Efficient)

```
1. Agent generates artifact (Markdown/HTML)
2. $ annotron artifact.md --agent
3. Browser opens → You see rendered HTML
4. You CLICK element in browser
5. You TYPE note: "Make this blue"
6. [NO API CALL] → Note saved locally
7. Agent polls annotron (single initial prompt)
8. Agent gets structured feedback: {selector, text, intent}
9. Agent applies changes to .md file
10. Browser live-reloads → You see result instantly
11. You CLICK next element, add note
12. [NO API CALL] → Still in same prompt context
13. ... repeat 10-20 times, all in ONE agent prompt context
14. Total cost per artifact: $0.01-0.05 (one prompt for all feedback)
```

**Time:** 2-3 seconds per feedback cycle (no API wait)
**Cost:** 80-95% reduction in token usage
**UX:** Click, comment, see result, repeat. Instant gratification.

---

## Token Efficiency Breakdown

### Example: Reviewing a 30-line tech spec

#### Old Way (With Prompts)
```
Feedback 1: "Add more detail on authentication"
API call 1: $0.03 → Wait 5s → See result

Feedback 2: "Fix the diagram colors"
API call 2: $0.02 → Wait 5s → See result

Feedback 3: "Add a new section on caching"
API call 3: $0.04 → Wait 5s → See result

Feedback 4: "Update the title"
API call 4: $0.02 → Wait 5s → See result

Total: 4 prompts × ~$0.03 = $0.12
Total time: 4 waits × 5s = 20 seconds
```

#### New Way (annotron)
```
Agent prompt 1: "Here's feedback I'll poll from the UI"
$ annotron poll spec.md (agent waits)

[Browser opens, you see HTML]

Your clicks (all LOCAL, no API):
- Click "Authentication" section
- Type: "Add more detail"
- [Instant local save]
- Click diagram
- Type: "Fix colors"
- [Instant local save]
- Click title
- Type: "Update this"
- [Instant local save]

[Agent receives all 3 feedback items in ONE structured JSON]
Agent applies all changes
Agent prompt 2: "Applied all feedback, here's what changed"

Total: 1-2 agent prompts = ~$0.02-0.04
Total time: 10-15 seconds (no waits between feedback items)
```

---

## What Makes It Zero-Token?

### 1. **Everything Runs Locally**
- Markdown → HTML rendering (offline)
- Click detection (offline)
- Comment storage (offline)
- Live preview via file-watch (offline)
- File-save (offline)

**No API calls between feedback items.**

### 2. **Structured Feedback Reduces Ambiguity**
- Instead of: "This looks weird, fix it"
- You give: `{selector: "h2", text: "Authentication", note: "Add 3 more details"}`

Agent understands EXACTLY what to change. One prompt handles 10+ feedback items.

### 3. **Diagram Support (Offline)**
- Markdown mermaid blocks render to SVG (merslim)
- UML diagrams display inline
- You can comment on them
- No token cost for visualization

### 4. **Save Back to Markdown (Offline)**
- Edits go directly to .md file
- No extra "save" API call
- No intermediate formats

---

## Real-World ROI

### Scenario: Building a tech design document with Claude

**Without annotron:**
```
1. Initial generation: "claude -f spec.md"
   → Agent generates 50-line spec

2. 8 rounds of feedback:
   Round 1: "Add auth section" → $0.03
   Round 2: "Fix diagram" → $0.02
   Round 3: "More detail on caching" → $0.04
   Round 4: "Add performance metrics" → $0.03
   Round 5: "Clarify the flow" → $0.02
   Round 6: "Update colors in diagram" → $0.02
   Round 7: "Add example code" → $0.05
   Round 8: "Final polish" → $0.02

Total feedback cost: $0.23
Total time waiting: 40 seconds
```

**With annotron:**
```
1. Initial generation: "claude -f spec.md"
   → Agent generates 50-line spec

2. $ annotron spec.md --agent
   → Agent enters loop mode

3. You give 20+ feedback items in browser (all local):
   - Click section 1 → "Add auth section"
   - Click section 2 → "Fix diagram"
   - Click section 3 → "More detail on caching"
   ... 17 more clicks, all instant

4. Agent receives all feedback in 1 structured batch
   → Agent applies all changes in 1 prompt

Total feedback cost: $0.02-0.03
Total time waiting: 3-5 seconds (just initial polling)
Total time in annotron: 2 minutes (all clicking/commenting, no waits)
```

**Savings:**
- **Cost:** 80-90% reduction ($0.20 saved per document)
- **Time:** 35+ seconds saved (no API wait time)
- **Experience:** Instant feedback loop (2s vs 5s per cycle)

**Across 100 documents:** $20-30 saved on tokens alone, plus hours saved on waiting.

---

## When Token Savings Matter Most

### High-Volume Scenarios
- **Brainstorming:** Generate 10 ideas, refine each 5 times = 50 feedback loops
- **Documentation:** Write 20 pages, refine each 3 times = 60 feedback loops
- **Prototyping:** Build 5 mockups, iterate 8 times each = 40 feedback loops

### Cost-Conscious Teams
- Indie devs on Claude free tier (limited tokens)
- Agencies using OpenAI (token costs add up)
- Enterprises with LLM cost oversight

### Production Workflows
- Auto-generate reports → annotate for corrections (offline)
- Generate diagrams → annotate for refinement (offline)
- Create specs → annotate for completeness (offline)

---

## The Multiplier Effect

### One Agent Prompt = Many Feedback Cycles

**Without annotron:**
- 1 agent prompt = 1 edit
- N edits = N agent prompts = N × cost

**With annotron:**
- 1 agent prompt = N edits
- Agent polls feedback, applies all changes in context
- You give 10-20 feedback items per prompt

**Example:**
```
Agent prompt 1 (cost: $0.03):
"Please create a tech design doc for JWT authentication"
→ Generates 40-line document

You click in annotron (cost: $0.00):
- Add section on edge cases
- Fix typo on line 12
- Expand performance section
- Add diagram
- Update title
- Clarify the flow
- Add example code
- Fix colors
- ... 12 more feedback items

Agent prompt 2 (cost: $0.03):
"Apply this feedback and refine further"
→ Applies all 20 feedback items
→ Returns refined document

Total cost for fully-refined document: $0.06
(vs $0.60+ if doing it the old way)
```

---

## Feature Support (All Offline)

| Feature | Cost | Speed | Notes |
|---------|------|-------|-------|
| **Markdown rendering** | $0 | Instant | render-to-HTML locally |
| **Mermaid diagrams** | $0 | Instant | SVG via merslim |
| **UML diagrams** | $0 | Instant | Inline SVG |
| **Click to annotate** | $0 | Instant | Local event handlers |
| **Comment threads** | $0 | Instant | Local storage |
| **Image attachments** | $0 | Instant | Upload to local folder |
| **Live preview** | $0 | Instant | File-watch triggers reload |
| **Save to markdown** | $0 | Instant | Direct file write |
| **Outline navigation** | $0 | Instant | DOM traversal |

**Everything above the agent line is free and instant.**

---

## Why Other Tools Cost More

### Figma (Design System)
- Cloud rendering: $0.01+ per request
- Live collaboration: Real-time sync = API overhead
- Comments: Stored in cloud = API calls

### Google Docs (Editing)
- Cloud storage: Infrastructure costs passed to users
- Comments: Real-time sync = API overhead
- Collaboration: Real-time editing = API overhead

### VS Code (Code Editing)
- Live extensions: Each keystroke can trigger API calls
- AI completions: Every char = potential API call
- Inline diagnostics: File analysis = compute cost

### annotron (This Project)
- Local-first: Everything runs in browser
- Zero cloud: No infrastructure costs
- Structured feedback: Agent gets exactly what it needs
- Result: **Zero marginal cost per feedback item**

---

## The Math

### Per-Artifact Cost

**Without annotron (assuming 8 feedback rounds):**
```
Initial generation:     $0.05
8 × feedback rounds:    8 × $0.03 = $0.24
Total:                  $0.29
Time:                   45 seconds
```

**With annotron:**
```
Initial generation:     $0.05
Agent polling:          $0.02 (1 batch call for all feedback)
Total:                  $0.07
Time:                   5-10 seconds (in app, no waits)
```

**Per artifact savings:** $0.22 (76% reduction)

**Per 100 artifacts:**
- **Cost savings:** $22
- **Time savings:** 40+ minutes (no API wait time)
- **Experience:** Instant feedback loops vs waiting

**Per 1000 artifacts:**
- **Cost savings:** $220
- **Time savings:** 6+ hours
- **Experience:** 1000 instant loops vs 8000 seconds of waiting

---

## Bottom Line

**annotron = the most token-efficient feedback loop for AI agents**

- ✅ One prompt = 10-20 feedback cycles
- ✅ Zero cost per feedback item (offline)
- ✅ Instant visual feedback (2-3 seconds per cycle)
- ✅ Full context preserved (agent understands all feedback at once)
- ✅ Diagram support included (UML, mermaid, all free)
- ✅ Local-first (no cloud, no accounts)

**Perfect for:**
- 🚀 **Rapid iteration** (10x faster feedback loops)
- 💰 **Cost-conscious teams** (80%+ token savings)
- 📊 **Diagram-heavy docs** (architecture, tech specs, UML)
- 🔄 **Tight feedback cycles** (loop engineering)
- 🏠 **Privacy-first workflows** (everything local)

