import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rateLimit } from "express-rate-limit";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const PORT = Number(process.env.PORT) || 3001;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const VERSION = "0.8.0";
const STARTED_AT = Date.now();

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const FALLBACK_MODEL = process.env.GROQ_MODEL_FALLBACK || "openai/gpt-oss-20b";
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS) || 30000;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 60s
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 20; // 20 requests / window
const PROMPT_MAX_CHARS = Number(process.env.PROMPT_MAX_CHARS) || 8000;

// Allowed browsers that may call this backend. The extension runs inside
// chatgpt.com and backgrounds reach it with a chrome-extension:// origin.
const CORS_ALLOWED =
  (process.env.CORS_ALLOWED || "https://chatgpt.com").split(",").map((s) => s.trim()).filter(Boolean);
const isAllowedOrigin = (origin) =>
  !!origin &&
  (CORS_ALLOWED.includes(origin) || origin.startsWith("chrome-extension://"));

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// ── CORS (tightened: echo allowed origins only) ──────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Structured request logging (id, method, path, latency, status) ───────
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  req._start = process.hrtime.bigint();
  res.setHeader("X-Request-Id", req.id);
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - req._start) / 1e6;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        reqId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10
      })
    );
  });
  next();
});

// ── Rate limiting (default 20 req / min per IP) ──────────────────────────
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests. Slow down and try again.",
      code: "RATE_LIMITED",
      requestId: req.id
    });
  }
});
app.use("/analyze", limiter);

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
        const imgNote = t.images && t.images.length
          ? ` (image attached: ${t.images.map((i) => i.fileName || "image").join(", ")})`
          : "";
        parts.push(`  ${i + 1}. ${snippet}${imgNote}`);
      });
      parts.push("IMPORTANT: If an earlier turn involved an image, carry that visual context forward — keep the improved prompt aware that this conversation has an image element.");
    }
    if (context.images?.length) {
      parts.push(`Currently attached images: ${context.images.map((i) => i.fileName || "image").join(", ")}`);
      parts.push("Reference the attached image(s) explicitly in the improved prompt.");
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
    '<role>      The perspective the AI should adopt: a specific human professional matched to the intent (e.g. "a professional photographer", "a senior software engineer", "an experienced chef", "a seasoned UX designer", "a published fiction author"). NEVER use "an AI assistant" — always a human expert role. Begin the content with "You are a...". Omit if a persona adds no value.',
    '<task>      The core task, stated precisely. Always include.',
    '<context>   Background, audience, constraints and safe assumptions. Omit if nothing is needed.',
    '<instructions> Ordered steps or strict requirements the AI must follow. Omit if the task is trivial.',
    '<examples>  One concise input/output example when it clearly helps. Omit otherwise.',
    '<output_format> What the final answer must look like (plain text, code block, JSON schema, bullets, table, length). Omit for trivial outputs.',
    '<visual_context> If images are part of this conversation (currently or in an earlier turn), describe how the prompt should reference them. Omit only if no image was ever involved.',
    'Rules for the tags:',
    "- Start with <role>, then <task>, then <context>, <instructions>, <examples>, <output_format>, <visual_context>.",
    "- Each section spans one or more lines: the opening tag on its own line, the content, then the closing tag on its own line.",
    "- Always give <role> a human professional persona (e.g. 'You are a professional landscape photographer'), never a generic 'AI assistant'.",
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

// ── Validation ────────────────────────────────────────────────────────────
function validateRequest(prompt, mode, context) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    return { error: "prompt is required", code: "VALIDATION_ERROR" };
  }
  if (prompt.length > PROMPT_MAX_CHARS) {
    return { error: `prompt must be ${PROMPT_MAX_CHARS} characters or fewer`, code: "VALIDATION_ERROR" };
  }
  if (mode && !["light", "balanced", "deep"].includes(mode)) {
    return { error: "mode must be one of: light, balanced, deep", code: "VALIDATION_ERROR" };
  }
  if (context !== null && context !== undefined && typeof context !== "object") {
    return { error: "context must be an object", code: "VALIDATION_ERROR" };
  }
  if (context && Array.isArray(context.recentTurns) && context.recentTurns.length > 3) {
    context.recentTurns = context.recentTurns.slice(0, 3);
  }
  if (context && Array.isArray(context.images) && context.images.length > 5) {
    context.images = context.images.slice(0, 5);
  }
  return null;
}

function sendError(res, status, code, message, requestId) {
  res.status(status).json({ error: message, code, requestId });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    model: MODEL,
    fallbackModel: FALLBACK_MODEL
  });
});

app.post("/analyze", async (req, res) => {
  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const mode = typeof body.mode === "string" ? body.mode : "balanced";
  const context = body.context !== undefined ? body.context : null;

  const invalid = validateRequest(prompt, mode, context);
  if (invalid) return sendError(res, 400, invalid.code, invalid.error, req.id);

  if (!process.env.GROQ_API_KEY) {
    return sendError(res, 500, "MISSING_KEY", "GROQ_API_KEY is not set. Create backend/.env from .env.example", req.id);
  }

  try {
    const result = await fetchGroq(prompt, mode, context);
    res.json({ ...result, mode, model: result._model || MODEL });
  } catch (err) {
    console.error(`[prompter] /analyze failed (${req.id}):`, err.message);
    const mapped = mapError(err);
    sendError(res, mapped.status, mapped.code, mapped.message, req.id);
  }
});

// Translate thrown errors into a consistent { status, code, message } shape.
class GroqHttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function mapError(err) {
  if (err instanceof GroqHttpError) {
    if (err.code === "MODEL_REFUSED") return { status: 502, code: err.code, message: "The model refused to answer. Try again." };
    if (err.code === "RATE_LIMITED") return { status: 429, code: err.code, message: "Groq rate limit hit. Wait a moment and retry." };
    if (err.code === "TIMEOUT") return { status: 504, code: err.code, message: "Analysis timed out. Try again." };
    return { status: err.status, code: err.code || "GROQ_UNAVAILABLE", message: err.message };
  }
  if (/aborted|timeout/i.test(err.message)) {
    return { status: 504, code: "TIMEOUT", message: "Analysis timed out. Try again." };
  }
  return { status: 502, code: "GROQ_UNAVAILABLE", message: `Groq request failed: ${err.message}` };
}

async function fetchGroq(prompt, mode, context) {
  // Attempt 1: strict JSON mode. Attempt 2: plain text, parsed defensively.
  // Some models refuse or return prose in strict JSON mode; failing hard on that
  // would silently send the user back to the mock. So we retry without it.
  // If both attempts fail on the primary model, fall back to a second model.
  let primaryError;

  for (const strictJson of [true, false]) {
    try {
      const content = await groqCompletion(prompt, mode, context, strictJson, MODEL);
      const parsed = parseLlmJson(content);
      if (typeof parsed.improved_prompt !== "string") {
        throw new Error("Output was not a valid analysis JSON");
      }
      const analysis = normalize(parsed);
      return { ...analysis, _model: MODEL };
    } catch (err) {
      primaryError = err;
      console.warn(`[prompter] primary ${strictJson ? "json" : "plain"} failed:`, String(err.message).slice(0, 160));
    }
  }

  // Primary model exhausted → try the fallback (real Groq model, e.g. gpt-oss-20b).
  console.warn(`[prompter] falling back to ${FALLBACK_MODEL}`);
  for (const strictJson of [true, false]) {
    try {
      const content = await groqCompletion(prompt, mode, context, strictJson, FALLBACK_MODEL);
      const parsed = parseLlmJson(content);
      if (typeof parsed.improved_prompt !== "string") {
        throw new Error("Output was not a valid analysis JSON");
      }
      const analysis = normalize(parsed);
      return { ...analysis, _model: FALLBACK_MODEL };
    } catch (err) {
      console.warn(`[prompter] fallback ${strictJson ? "json" : "plain"} failed:`, String(err.message).slice(0, 160));
    }
  }

  throw primaryError || new Error("All model attempts failed");
}

async function groqCompletion(prompt, mode, context, strictJson, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const payload = {
      model,
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
      // Map Groq's HTTP statuses so the client gets a consistent error shape.
      if (resp.status === 429) {
        throw new GroqHttpError(429, text.slice(0, 200), "RATE_LIMITED");
      }
      if (resp.status === 401 || resp.status === 403) {
        throw new GroqHttpError(resp.status, "Groq auth failed — check GROQ_API_KEY", "AUTH_FAILED");
      }
      throw new GroqHttpError(resp.status, `Groq HTTP ${resp.status}: ${text.slice(0, 300)}`, "GROQ_HTTP_ERROR");
    }

    const json = await resp.json();
    const content = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : "";
    // Bail on obvious refusals so the caller can retry (or fall back cleanly).
    // Only applies to prose replies — valid analysis JSON always starts with '{'.
    const head = content.trim();
    if (!head || (head[0] !== "{" && /i'?m sorry|cannot help|can'?t help|cannot assist|unfortunately/i.test(head.slice(0, 200)))) {
      throw new GroqHttpError(502, "Model refused or returned empty content", "MODEL_REFUSED");
    }
    return content;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new GroqHttpError(504, "Request timed out", "TIMEOUT");
    }
    throw err;
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

// ── Startup + graceful shutdown ──────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[prompter] backend listening on http://localhost:${PORT}`);
  console.log(`[prompter] model: ${MODEL} | fallback: ${FALLBACK_MODEL}`);
  console.log(`[prompter] rate limit: ${RATE_LIMIT_MAX} req/${RATE_LIMIT_WINDOW_MS / 1000}s`);
  console.log(`[prompter] GROQ_API_KEY: ${process.env.GROQ_API_KEY ? "set" : "NOT set"}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[prompter] ${signal} received, shutting down…`);
  server.close(() => {
    console.log("[prompter] server closed");
    process.exit(0);
  });
  // Force-exit if in-flight requests take too long.
  setTimeout(() => {
    console.error("[prompter] forced exit after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));