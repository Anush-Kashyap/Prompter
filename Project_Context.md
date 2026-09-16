# PROMPTER
## AI Prompt Intelligence Layer — Project Context

> **Status:** Planning / V1 Development  
> **Primary platform:** Chromium browser extension  
> **Initial target:** ChatGPT Web  
> **Future targets:** Claude, Gemini, Perplexity, Cursor, VS Code and other AI interfaces  
> **Development approach:** Build incrementally. Do not over-engineer V1.

---

# 1. Product Vision

Prompter is a browser extension that acts as an **intelligence layer between humans and AI systems**.

The goal is NOT to build another chatbot.

The goal is to improve how people communicate with existing AI systems.

### Core experience

```text
User writes naturally
        ↓
Prompter detects the prompt
        ↓
Analyzes intent + quality
        ↓
Identifies weaknesses / missing information
        ↓
Generates an improved version
        ↓
User clicks "Replace"
        ↓
Improved prompt replaces the original
```

The interaction should feel almost invisible.

The user should be able to continue using ChatGPT normally while Prompter quietly helps when useful.

---

# 2. The Problem

People frequently give AI incomplete, ambiguous or poorly structured instructions.

Examples:

```text
make a website for my college fest

fix my python code

explain this

make this better

give me a good project idea
```

These prompts may communicate the general intention, but often lack:

- Context
- Constraints
- Desired output
- Audience
- Technical requirements
- Examples
- Evaluation criteria
- Relevant background information

Users can manually ask another AI to improve their prompt, but that introduces friction:

```text
Write prompt
    ↓
Copy
    ↓
Open prompt enhancer
    ↓
Paste
    ↓
Improve
    ↓
Copy
    ↓
Return to ChatGPT
    ↓
Paste again
```

Prompter should eliminate this workflow.

---

# 3. Core Product Principle

Prompter should **improve the user's communication without changing the user's intent**.

This is extremely important.

If the user writes:

> Build me a portfolio website.

Prompter must not decide that the user actually wants:

> Build me a React + Next.js portfolio website with a dark cyberpunk aesthetic...

unless those assumptions are clearly identified as assumptions.

Prompter should distinguish between:

### Known intent

What the user explicitly asked for.

### Missing information

Information that would improve the result.

### Reasonable assumptions

Information Prompter could infer, but should clearly identify.

### Optional enhancement

Additional improvements that are not necessary.

---

# 4. V1 Product

V1 should be intentionally small.

## V1 objective

Prove the fundamental interaction:

> **Type → Analyze → Improve → Replace**

Do NOT start by building the entire platform.

---

# 5. V1 Platform

Build Prompter as a **Chrome/Chromium browser extension using Manifest V3**.

Initially support:

```text
ChatGPT Web
```

Do NOT initially support:

- Claude
- Gemini
- Perplexity
- Cursor
- VS Code
- Mobile
- Desktop applications

These should be added only after the ChatGPT integration is stable.

---

# 6. V1 User Flow

User opens ChatGPT.

They type:

```text
make a website for tathva
```

Prompter detects the input.

A small unobtrusive control appears near the prompt:

```text
✦ Improve
```

The user clicks it.

Prompter analyzes the prompt.

Example:

```text
PROMPTER

Prompt Health
72%

Your goal is clear.

Missing:
⚠ Target audience
⚠ Visual direction
⚠ Required sections

Suggested prompt:

Create a modern website for Tathva, a college
technology festival. Design it for college students
and prospective participants. Use a futuristic
technology-focused visual direction and include
sections for events, schedule, sponsors, registration
and contact information.

[ Replace ]   [ Copy ]   [ Explain ]
```

When the user clicks:

```text
Replace
```

the original prompt inside ChatGPT's input box is replaced with the improved prompt.

The user can then send it normally.

---

# 7. Prompt Intelligence

Prompter should analyze several dimensions.

## 7.1 Intent

Determine what the user is trying to accomplish.

Possible categories:

```text
Coding
Debugging
Learning
Research
Writing
Design
Brainstorming
Planning
Analysis
Summarization
Translation
Creative
Image Generation
Other
```

This list should remain extensible.

---

## 7.2 Context

Determine whether sufficient context exists.

Example:

```text
Explain normalization.
```

Prompter may determine:

```text
Goal: Explain database normalization

Missing:
- User's current knowledge level
- Desired depth
- Whether examples are required
```

---

## 7.3 Constraints

Look for constraints such as:

```text
Language
Framework
Word count
Budget
Time
Technology
Difficulty
Audience
Platform
Formatting
Performance
```

---

## 7.4 Output Specification

Determine whether the user has explained what the final result should look like.

For example:

```text
"Explain Python decorators"
```

could be improved by specifying:

```text
Explain Python decorators to a beginner.
Start with the intuition, then show a simple example,
then explain how the syntax works.
```

---

## 7.5 Ambiguity

Detect phrases that could have multiple interpretations.

Examples:

```text
make it better
fix this
make it professional
explain this
optimize it
build an app
```

Prompter should identify ambiguity rather than blindly inventing requirements.

---

# 8. Prompt Health

V1 should eventually expose a simple quality indicator.

Example:

```text
Prompt Health
███████░░░ 72%
```

The score should NOT pretend to be scientifically precise.

It is a UX indicator.

Possible dimensions:

```text
Intent          ✓
Context         ⚠
Constraints     ⚠
Output          ✕
Specificity     ✓
Ambiguity       ⚠
```

Avoid presenting the score as an objective measure of prompt quality.

---

# 9. Rewrite Modes

Prompter should eventually support three levels.

### Light

Minimal modification.

Preserve the user's wording and style.

### Balanced

Improve structure, context and output requirements.

This should be the default.

### Deep

Significantly restructure the prompt when necessary.

Deep mode should still preserve the user's original intent.

---

# 10. "Why?" Feature

One of Prompter's differentiating features should be:

```text
[ Explain ]
```

When clicked, Prompter explains why it changed the prompt.

Example:

```text
Why?

We added an output format because your original
request did not specify how you wanted the answer
structured.

We also clarified the target audience because it
affects the level of detail and terminology.
```

The goal is to help users **learn how to communicate with AI**, not just automatically rewrite everything.

---

# 11. Passive vs Active Mode

Prompter should avoid becoming annoying.

## Passive Mode

Prompter quietly detects potential improvements.

Example:

```text
✦ 2 improvements
```

No popup should automatically cover the user's interface.

## Active Mode

The user clicks the Prompter control.

A compact analysis panel appears.

Example:

```text
┌─────────────────────────────┐
│ ✦ PROMPTER                  │
│                             │
│ Prompt Health       78%     │
│                             │
│ ⚠ Missing output format    │
│ ⚠ Missing constraints      │
│                             │
│ Suggested prompt            │
│ ──────────────────────────  │
│ ...                         │
│                             │
│ [ Replace ] [ Copy ]        │
│ [ Explain ] [ Dismiss ]     │
└─────────────────────────────┘
```

---

# 12. Architecture

The extension should be modular.

Recommended architecture:

```text
                    PROMPTER
                       │
               Browser Extension
                       │
              ┌────────┴────────┐
              │                 │
        Platform Adapter    Extension UI
              │                 │
              ↓                 ↓
          ChatGPT DOM       Prompter Panel
              │
              ↓
        Prompter Core
              │
      ┌───────┼────────┐
      ↓       ↓        ↓
   Analyzer Rewriter Context
      │       │        │
      └───────┼────────┘
              ↓
          Backend API
              ↓
          LLM Provider
```

---

# 13. Project Structure

Start with:

```text
prompter/
│
├── extension/
│   ├── manifest.json
│   │
│   ├── content/
│   │   ├── content.ts
│   │   ├── detector.ts
│   │   └── injector.ts
│   │
│   ├── ui/
│   │   ├── prompter-button.ts
│   │   ├── analysis-panel.ts
│   │   └── styles.css
│   │
│   ├── adapters/
│   │   └── chatgpt.ts
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   │
│   └── background/
│       └── service-worker.ts
│
├── backend/
│   ├── api/
│   ├── analyzer/
│   └── rewriter/
│
├── shared/
│   ├── types.ts
│   └── schemas.ts
│
├── package.json
└── README.md
```

This structure may evolve as the project develops.

Do not create unnecessary abstractions before they are needed.

---

# 14. Platform Adapter Architecture

The extension must NOT hard-code all platform-specific logic into the core.

Use adapters.

Example:

```text
adapters/
├── chatgpt.ts
├── claude.ts
└── gemini.ts
```

Each adapter should handle:

```text
Detect input
Read input
Determine input state
Inject UI
Replace input
Handle platform-specific DOM behavior
```

The core Prompter intelligence should remain platform-independent.

This is important because AI websites can change their DOM structure.

---

# 15. ChatGPT Adapter

The first adapter should support ChatGPT Web.

Responsibilities:

```text
1. Detect the prompt input
2. Detect when the user is typing
3. Read current prompt
4. Position Prompter UI
5. Trigger analysis
6. Receive improved prompt
7. Replace the existing input
8. Ensure ChatGPT recognizes the replacement
```

Do not assume the input is always a simple `<textarea>`.

Modern AI applications frequently use:

```text
textarea
contenteditable
ProseMirror
custom editors
React-controlled inputs
```

The implementation must inspect the current DOM and use robust detection.

Avoid brittle selectors wherever possible.

---

# 16. Backend

The AI processing should eventually happen through a backend.

Do NOT expose private LLM API keys directly inside the browser extension.

Desired flow:

```text
Extension
    ↓
POST /analyze
    ↓
Backend
    ↓
LLM
    ↓
Structured response
    ↓
Extension
```

Example response:

```json
{
  "score": 72,
  "intent": "website_design",
  "issues": [
    {
      "type": "missing_context",
      "message": "Target audience is unspecified"
    },
    {
      "type": "missing_output",
      "message": "Desired website sections are unspecified"
    }
  ],
  "improved_prompt": "..."
}
```

The exact API schema may evolve.

---

# 17. Structured AI Output

The LLM should NOT simply return arbitrary prose.

The backend should request structured output containing fields such as:

```text
intent
confidence
score
issues
assumptions
improved_prompt
explanation
```

This allows the frontend to reliably render the analysis.

---

# 18. Important Product Rule

Prompter should never make unnecessary changes.

Bad:

```text
User:
Write a Python script to rename files.

Prompter:
Create a production-grade Python 3.12 CLI application
using Typer with comprehensive unit tests...
```

This is over-engineering.

Good:

```text
Write a Python script that renames files in a specified
folder according to a naming pattern. Include an example
of how to run it.
```

The improvement should be proportional to the original request.

---

# 19. Don't Automatically Ask Questions

Prompter should not interrupt the user every time information is missing.

Instead classify missing information:

### Critical

The request cannot reasonably be completed.

Potentially ask the user.

### Useful

The AI can make a reasonable assumption.

Suggest an improvement.

### Optional

Don't bother the user.

This keeps Prompter fast and unobtrusive.

---

# 20. V1 Non-Goals

Do NOT build these initially:

```text
❌ AI chatbot
❌ Local AI model
❌ Multi-agent system
❌ Autonomous browser agent
❌ Prompt marketplace
❌ Social network
❌ Prompt-sharing platform
❌ Complex dashboard
❌ Mobile application
❌ Desktop application
❌ Support for every AI platform
❌ Fine-tuned proprietary model
❌ Massive prompt library
```

The first goal is to prove the interaction.

---

# 21. Development Roadmap

## Phase 0 — Research

Understand:

- Chrome Manifest V3
- Content scripts
- Service workers
- DOM interaction
- contenteditable elements
- browser extension security
- communication between extension components

---

## Phase 1 — Extension Prototype

Build:

```text
Chrome
 ↓
ChatGPT
 ↓
Detect prompt input
 ↓
Show Prompter button
 ↓
Read prompt
 ↓
Display mock improved prompt
 ↓
Replace prompt
```

At this stage the improvement can be hardcoded.

The purpose is proving the browser interaction.

---

## Phase 2 — Real AI

Replace the mock response with:

```text
Extension
 ↓
Backend
 ↓
LLM
 ↓
Structured analysis
 ↓
Extension UI
```

---

## Phase 3 — Prompt Intelligence

Add:

- Intent detection
- Missing context
- Ambiguity detection
- Constraints
- Output specification
- Prompt Health
- Rewrite modes
- Explanation

---

## Phase 4 — Platform Expansion

Add:

```text
Claude
Gemini
Perplexity
```

Each should have its own adapter.

---

## Phase 5 — Dashboard

Only after the extension is useful.

Dashboard features:

```text
Prompt history
Saved prompts
Prompt analytics
Settings
Rewrite preferences
Account
```

---

# 22. Future Vision

Eventually Prompter could become an **AI communication layer**.

Instead of:

```text
Human → AI
```

Prompter becomes:

```text
Human
  ↓
Intent
  ↓
Prompter
  ↓
Context + Constraints + Structure
  ↓
AI
```

The user does not need to learn complicated prompt-engineering syntax.

They communicate naturally.

Prompter handles the translation into a clearer machine instruction.

---

# 23. Potential Differentiation

Prompter should NOT compete purely on:

> "We write better prompts."

The stronger positioning is:

> **Prompter understands what you're trying to accomplish and helps you communicate it clearly to AI.**

Important differentiators:

```text
✓ Works directly inside AI interfaces
✓ One-click replacement
✓ Context-aware
✓ Platform-aware
✓ Explains improvements
✓ Preserves user intent
✓ Detects missing information
✓ Teaches users while helping them
```

---

# 24. UX Principles

Prompter should feel:

```text
Fast
Minimal
Helpful
Non-intrusive
Understandable
Trustworthy
Modern
```

Avoid:

```text
Clutter
Huge popups
Constant notifications
Unnecessary animations
Fake precision
Overly technical terminology
```

The user should be able to ignore Prompter completely when they don't need it.

---

# 25. Performance

The extension must not analyze every keystroke using an LLM.

Avoid:

```text
Every keypress
    ↓
API request
```

Instead use strategies such as:

```text
Debouncing
Idle detection
Minimum prompt length
User-triggered analysis
Caching
```

The extension should feel instant.

---

# 26. Privacy

Prompts can contain sensitive information.

The architecture should treat user prompts as sensitive data.

Principles:

```text
Do not store prompts unnecessarily.
Do not log complete prompts by default.
Do not send prompts anywhere without clear product behavior.
Minimize data retention.
Keep API credentials server-side.
```

Privacy requirements should be revisited before production release.

---

# 27. Acceptance Criteria — V1

V1 is successful when all of the following work:

### Extension

- [ ] Extension loads successfully in Chrome/Chromium.
- [ ] Manifest V3 is used.
- [ ] Content script loads on ChatGPT.
- [ ] Prompt input is detected reliably.
- [ ] Prompter UI appears without breaking ChatGPT.
- [ ] Current prompt can be read.
- [ ] Prompt can be sent to the analysis layer.
- [ ] Improved prompt can be returned.
- [ ] Improved prompt can be displayed.
- [ ] "Replace" correctly updates ChatGPT's input.
- [ ] ChatGPT recognizes the replaced text.
- [ ] User can dismiss Prompter.
- [ ] Extension does not interfere with normal typing.

### Intelligence

- [ ] Intent can be identified.
- [ ] Basic weaknesses can be detected.
- [ ] Improved prompt preserves original intent.
- [ ] Structured response is returned.

### UX

- [ ] No intrusive popup on every prompt.
- [ ] Loading state is clear.
- [ ] Errors are handled gracefully.
- [ ] User can still use ChatGPT if Prompter fails.

---

# 28. Development Rules for OpenCode

When implementing this project:

1. **Do not build everything at once.**
2. Complete one phase before moving to the next.
3. Prefer simple implementations over unnecessary abstractions.
4. Keep platform-specific logic inside adapters.
5. Keep the AI intelligence independent from the browser UI.
6. Never expose private API keys in the extension.
7. Do not introduce a local AI model.
8. Do not create a desktop application for V1.
9. Do not add features simply because they sound impressive.
10. Test the actual user interaction frequently.
11. Keep the extension functional even if the backend is unavailable.
12. Do not silently change the user's intent.
13. Document important architectural decisions.
14. Update this `PROJECT_CONTEXT.md` when major architectural decisions change.

---

# 29. First Task

Before implementing the complete product:

### Build only this:

```text
1. Create Manifest V3 extension
2. Load it in Chrome
3. Detect ChatGPT's prompt input
4. Add a small "✦ Improve" control
5. Read the current prompt
6. Open a minimal Prompter panel
7. Use a mock improved prompt
8. Implement "Replace"
9. Verify ChatGPT receives the replaced text
```

Do not implement the backend yet.

Do not implement authentication yet.

Do not implement Claude/Gemini yet.

Do not implement the dashboard yet.

**First prove that Prompter can successfully sit inside ChatGPT and modify the user's prompt.**

Once this works reliably, continue to Phase 2.