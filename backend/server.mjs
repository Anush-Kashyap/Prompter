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
    "Mode: LIGHT. Only fix critical missing context that would prevent the request from being understood. Keep changes minimal and the prompt close to the original. List only critical issues.",
  balanced:
    "Mode: BALANCED. Add useful context where it is safe to assume it. Stay proportional to the request and keep the prompt concise. List critical and useful issues.",
  deep:
    "Mode: DEEP. Be comprehensive: include constraints, examples, expected output format and edge cases when they add real value. List critical, useful and optional issues."
};

function buildSystemPrompt(mode) {
  const allowed = ["light", "balanced", "deep"];
  const guidance = MODE_GUIDANCE[allowed.includes(mode) ? mode : "balanced"] || MODE_GUIDANCE.balanced;

  return [
    'You are Prompter, a prompt-improvement engine. Analyze the user\'s prompt and return a proportional improvement.',
    'Rules:',
    '- Keep the user\'s original intent intact. Do NOT change or add to what they asked for.',
    '- Do not over-engineer. The improvement must stay proportional to the request.',
    '- Only add context it is safe to assume (audience, output shape, examples); never silently rewrite the task.',
    '- If the prompt is already clear, make only tiny clarifications and list few or no issues.',
    '- Never refuse. If the user\'s prompt touches something problematic, do not apologize or refuse: report it as a critical issue instead and still return the JSON exactly as specified.',
    guidance,
    'Respond with a single JSON object, no prose, using EXACTLY this shape:',
    '{',
    '  "score": <integer 0-100 overall prompt quality>,',
    '  "intent": "<short lowercase intent id, e.g. coding|website_design|learning|brainstorming|writing|other>",',
    '  "confidence": <float 0-1 how sure you are about the intent>,',
    '  "issues": [',
    '    { "type": "missing_context|missing_output|ambiguous|constraint",',
    '      "severity": "critical|useful|optional",',
    '      "message": "<one sentence, user-facing>" }',
    '  ],',
    '  "assumptions": ["<safe assumptions you made>"],',
    '  "improved_prompt": "<the improved prompt, plain text>",',
    '  "explanation": "<2-3 sentences: what you changed and why>"',
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

  try {
    const raw = await fetchGroq(prompt, mode);
    const analysis = normalize(raw);
    res.json({ ...analysis, mode, model: MODEL });
  } catch (err) {
    console.error("[prompter] /analyze failed:", err.message);
    res.status(502).json({ error: `Groq request failed: ${err.message}` });
  }
});

async function fetchGroq(prompt, mode) {
  // Attempt 1: strict JSON mode. Attempt 2: plain text, parsed defensively.
  // Some models refuse or return prose in strict JSON mode; failing hard on that
  // would silently send the user back to the mock. So we retry without it.
  let lastErr;
  for (const strictJson of [true, false]) {
    try {
      const content = await groqCompletion(prompt, mode, strictJson);
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

async function groqCompletion(prompt, mode, strictJson) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const payload = {
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: buildSystemPrompt(mode) },
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
    confidence: clampNumber(parsed.confidence, 0, 1, 0.8),
    issues,
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim())
      : [],
    improved_prompt:
      typeof parsed.improved_prompt === "string" && parsed.improved_prompt.trim()
        ? parsed.improved_prompt.trim()
        : "",
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : ""
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