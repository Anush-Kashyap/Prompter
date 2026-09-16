import type { AnalysisResult } from "../types";

// Phase 1 fallback: a lightweight local analyzer used when the
// backend (LLM) is unavailable. Returns the same schema as /analyze.
export function mockAnalyze(prompt: string): AnalysisResult {
  const lower = prompt.toLowerCase().trim();

  let intent = "other";
  let confidence = 0.8;
  const issues: AnalysisResult["issues"] = [];

  if (/(code|program|function|script|bug|error|fix|debug)/.test(lower)) {
    intent = "coding";
    confidence = 0.9;
    if (!/(python|javascript|typescript|java|c\+\+|react|node|rust|go)\b/.test(lower)) {
      issues.push({ type: "missing_context", severity: "useful", message: "Language and framework are not specified." });
    }
  } else if (/(write|create|build|make)/.test(lower) && /(website|web|page|app)/.test(lower)) {
    intent = "website_design";
    confidence = 0.85;
    issues.push(
      { type: "missing_context", severity: "useful", message: "Target audience is not specified." },
      { type: "missing_output", severity: "useful", message: "Desired website sections are not specified." }
    );
  } else if (/(explain|learn|understand)/.test(lower)) {
    intent = "learning";
    confidence = 0.88;
    issues.push({ type: "missing_context", severity: "useful", message: "Target audience and desired depth are not specified." });
  } else if (/(brainstorm|ideas|concepts)/.test(lower)) {
    intent = "brainstorming";
    confidence = 0.8;
    issues.push({ type: "missing_context", severity: "optional", message: "Consider adding constraints and evaluation criteria." });
  }

  if (!/(for|using|with|in|on)/.test(lower) && intent !== "other") {
    issues.push({ type: "missing_context", severity: "useful", message: "Consider adding more context." });
  }
  if (/(better|improve|optimize|fix this)/.test(lower)) {
    issues.push({ type: "ambiguous", severity: "useful", message: 'Prompt is ambiguous — specify what "better" means.' });
  }

  const score = Math.min(100, Math.round(confidence * 100) - issues.length * 3);

  return {
    score,
    intent,
    confidence,
    issues,
    assumptions: [],
    improved_prompt: mockImprovedPrompt(intent, prompt),
    explanation: "Local mock analysis (backend offline). Added the most common missing context for the detected intent.",
    model: "mock"
  };
}

function mockImprovedPrompt(intent: string, prompt: string): string {
  if (intent === "website_design") {
    return "Create a modern website for Tathva, a college technology festival. Design it for college students and prospective participants. Use a futuristic, technology-focused visual direction and include sections for events, schedule, sponsors, registration and contact information.";
  }
  if (intent === "coding") {
    return "Write a Python script that solves the problem. Include error handling, type hints, and a brief explanation of how to run it.";
  }
  if (intent === "learning") {
    return "Explain this concept to a beginner. Start with the intuition, then show a simple example, then explain how it works under the hood.";
  }
  if (intent === "brainstorming") {
    return `${prompt.trim()}\n\nProvide 5–8 varied ideas and note which ones are most practical, plus any constraints or evaluation criteria you'd apply.`;
  }
  return `${prompt.trim()}\n\nPlease include any relevant context, constraints and desired output format.`;
}