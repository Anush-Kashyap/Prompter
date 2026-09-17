import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const PORT = process.env.PORT || 3001;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const app = express();
app.use(express.json({ limit: "100kb" }));

// CORS: the content script runs on https://chatgpt.com and fetches this
// server on http://localhost - it must respond with CORS headers.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const MODE_GUIDANCE = {
  light:
    "Mode: LIGHT. Structure the prompt with the XML-style tags but change as little content as possible. Use at most <role>, <task>, and <output_format> (only when the user hinted at a format). Do not add new requirements or context beyond fixing what is critical. List only critical issues.",
  balanced:
    "Mode: BALANCED. Structure the prompt with the XML-style tags. Derive a fitting <role> persona from the intent, write a precise <task>, and add <context>, <instructions>, and <output_format> only where they add real value. Keep the total output proportional and concise. List critical and useful issues.",
  deep:
    "Mode: DEEP. Use the full tag set: <role>, <task>, <context>, <instructions>, <examples>, and <output_format>. Add constraints, edge cases, and a clarifying example when they add real value. Be comprehensive but never invent facts the user didn't imply. List critical, useful and optional issues."
};

function buildSystemPrompt(mode, context) {
  const allowed = ["light", "balanced", "deep"];
  const guidance = MODE_GUIDANCE[allowed.includes(mode) ? mode : "balanced"] || MODE_GUIDANCE.balanced;

  // Build context section if available
  let contextSection = "";
  if (context && (context.recentTurns?.length || context.images?.length)) {
    const parts = ["CONTEXT FROM THIS SESSION (use to avoid repetition and build on prior intent):"];
    if (context.recentTurns?.length) {
      parts.push("Previous user prompts (most recent first):");
      context.recentTurns.slice(0, 3).forEach((t, i) => {
        const snippet = t.prompt.slice(0, 200);
        parts.push(`  ${i + 1}. ${snippet}`);
      });
    }
    if (context.images?.length) {
      parts.push(`Attached images: ${context.images.map((i) => i.fileName || "image").join(", ")}`);
      parts.push("Reference these explicitly in the improved prompt (e.g., 'Analyze the error in screenshot.png...').");
    }
    contextSection = parts.join("\n") + "\n";
  }

  return [
    'You are Prompter, a prompt-improvement engine. Analyze the user\'s prompt and return a proportional improvement.',
    'Rules:',
    '- Keep the user\'s original intent intact. Do NOT change or add to what they asked for.',
    '- Do not over-engineer. The improvement must stay proportional to the request.',
    '- Only add context it is safe to assume (audience, output shape, examples); never silently rewrite the task.',
    '- If the prompt is already clear, make only tiny clarifications and list few or no issues.',
    '- Never refuse. If the user\'s prompt touches something problematic, do not apologize or refuse: report it as a critical issue instead and still return the JSON exactly as specified.',
    guidance,
    contextSection,
    'IMPORTANT — improved_prompt construction:',
    'The improved_prompt must be a standalone, ready-to-paste prompt written in a structured,',
    'Anthropic-style format. It is built from XML-style tags. Tag set, in order:',
    '<role>      The persona the AI should act as. Begin the content with "You are...". Omit if a persona adds nothing.',
    '<task>      The core task, stated precisely. Always include.',
    '<context>   Background, audience, constraints and safe assumptions. Omit if nothing is needed.',
    '<instructions> Ordered steps or strict requirements the AI must follow. Omit if the task is trivial.',
    '<examples>  One concise input/output example when it clearly helps. Omit otherwise.',
    '<output_format> What the final answer must look like (plain text, code block, JSON schema, bullets, table, length). Omit for trivial outputs.',
    '<visual_context> If images are attached, describe how the prompt should reference them. Omit if no images.',
    'Rules for the tags:',
    "- Start with <role>, then <task>, then <context>, <instructions>, <examples>, <output_format>, <visual_context>.",
    "- Each section spans one or more lines: the opening tag on its own line, the content, then the closing tag on its own line.",
    "- Derive the persona from the prompt's intent; never invent expertise the user didn't imply.",
    '- Do not add filler sections — drop tags that add no value. Keep the prompt proportional to the original.',
    '- Never wrap the structured prompt in backticks, triple backticks, quotes or JSON escaping.',
    'Respond with a single JSON object, no prose, using EXACTLY this shape:',
    '{',
    '  "score": <integer 0-100 overall prompt quality>,',
    '  "intent": "<short lowercase intent id, e.g. coding|website_design|learning|brainstorming|writing|other>",',
    '  "output_format": "<detected format: code|json|markdown|bullets|table|other>",',
    '  "confidence": <float 0-1 how sure you are about the intent>,',
    '  "issues": [',
    '    { "type": "missing_context|missing_output|ambiguous|constraint",',
    '      "severity": "critical|useful|optional",',
    '      "message": "<one sentence, user-facing>" }',
    '  ],',
    '  "assumptions": ["<safe assumptions you made>"],',
    '  "improved_prompt": "<the improved prompt: a ready-to-paste prompt built from the XML-style tags above. Keep its newlines. Do not escape or wrap it.>",',
    '  "explanation": "<2-3 sentences: what you changed and why>",',
    "  \"context_used\": <boolean: whether session context was used to shape the improvement>,",
    "  \"referenced_turns\": [<array of turn indices referenced, e.g. [0,1]>],",
    "  \"visual_context\": \"<if images attached, how the prompt references them; else empty string>\"",
    '}'
  ].join("\n");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

app.post("/analyze", async (req, res) => {
  const prompt = (req.body && req.body.prompt ? req.body.prompt : "").trim();
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY is not set. Create backend/.env from .env.example" });
  }

  const mode = req.body && req.body.mode ? String(req.body.mode) : "balanced";
  const context = req.body && req.body.context ? req.body.context : null;

  try {
    const raw = await fetchGroq(prompt, mode, context);
    const analysis = normalize(raw);
    res.json({ ...analysis, mode, model: MODEL });
  } catch (err) {
    console.error("[prompter] /analyze failed:", err.message);
    res.status(502).json({ error: `Groq request failed: ${err.message}` });
  }
});

async function fetchGroq(prompt, mode, context) {
  // Attempt 1: strict JSON mode. Attempt 2: plain text, parsed defensively.
  // Some models refuse or return prose in strict JSON mode; failing hard on that
  // would silently send the user back to the mock. So we retry without it.
  let lastErr;
  for (const strictJson of [true, false]) {
    try {
      const content = await groqCompletion(prompt, mode, context, strictJson);
      const parsed = parseLlmJson(content);
      if (typeof parsed.improved_prompt !== "string") {
        throw new Error("Output was not a valid analysis JSON");
      }
      return content;
    } catch (err) {
      lastErr = err;
      console.warn(`[prompter] attempt ${strictJson ? "json" : "plain"} failed:`, String(err.message).slice(0, 160));
    }
  }
  throw lastErr;
}

async function groqCompletion(prompt, mode, context, strictJson) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = {
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: buildSystemPrompt(mode, context) },
        { role: "user", content: prompt }
      ]
    };
    if (strictJson) payload.response_format = { type: "json_object" };

    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Groq HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }

    const json = await resp.json();
    const content = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : "";
    // Bail on obvious refusals so the caller can retry (or fall back cleanly).
    // Only applies to prose replies — valid analysis JSON always starts with '{'.
    const head = content.trim();
    if (!head || (head[0] !== "{" && /i'?m sorry|cannot help|can'?t help|cannot assist|unfortunately/i.test(head.slice(0, 200)))) {
      throw new Error("Model refused or returned empty content");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// Make sure the LLM's output matches our schema (defensive parse).
function normalize(raw) {
  const parsed = parseLlmJson(raw);

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .filter((i) => i && typeof i.message === "string" && i.message.trim())
        .map((i) => ({
          type: String(i.type || "issue"),
          severity: ["critical", "useful", "optional"].includes(i.severity) ? i.severity : "useful",
          message: i.message.trim()
        }))
    : [];

  return {
    score: clampInt(parsed.score, 0, 100, 70),
    intent: typeof parsed.intent === "string" ? parsed.intent : "other",
    output_format: typeof parsed.output_format === "string" ? parsed.output_format : "other",
    confidence: clampNumber(parsed.confidence, 0, 1, 0.8),
    issues,
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim())
      : [],
    improved_prompt:
      typeof parsed.improved_prompt === "string" && parsed.improved_prompt.trim()
        ? parsed.improved_prompt.trim()
        : "",
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
    context_used: Boolean(parsed.context_used),
    referenced_turns: Array.isArray(parsed.referenced_turns)
      ? parsed.referenced_turns.filter((n) => Number.isFinite(Number(n))).map((n) => Number(n))
      : [],
    visual_context: typeof parsed.visual_context === "string" ? parsed.visual_context : ""
  };
}

function parseLlmJson(raw) {
  if (!raw) return {};
  let text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

app.listen(PORT, () => {
  console.log(`[prompter] backend listening on http://localhost:${PORT}`);
  console.log(`[prompter] model: ${MODEL}`);
  console.log(`[prompter] GROQ_API_KEY: ${process.env.GROQ_API_KEY ? "set" : "NOT set"}`);
});