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
    output_format: detectOutputFormat(lower),
    confidence,
    issues,
    assumptions: [],
    improved_prompt: mockImprovedPrompt(intent, prompt),
    explanation: "Local mock analysis (backend offline). Added the most common missing context for the detected intent.",
    model: "mock"
  };
}

function detectOutputFormat(lower: string): string {
  if (/(json|javascript object|return.*object|api response)/.test(lower)) return "json";
  if (/(code|function|script|class|component|implementation)/.test(lower)) return "code";
  if (/(markdown|readme|\.md\b|fenced)/.test(lower)) return "markdown";
  if (/(bullet|list\b|number them|bullet point)/.test(lower)) return "bullets";
  if (/(table|csv|spreadsheet|columns)/.test(lower)) return "table";
  return "other";
}

function mockImprovedPrompt(intent: string, prompt: string): string {
  if (intent === "website_design") {
    return [
      "<role>You are an expert front-end developer and designer specializing in modern, conversion-focused college and event websites.</role>",
      "<task>Design and build a modern website for Tathva, a college technology festival.</task>",
      "<context>The target audience is college students and prospective participants. Visual direction should be futuristic and technology-focused. The site must feel alive, energetic and responsive on all devices.</context>",
      "<instructions>",
      "1. Define the information architecture: hero section, events, schedule, sponsors, registration and contact.",
      "2. Recommend a layout, color palette and typography.",
      "3. Provide implementation guidance using a lightweight framework or plain HTML/CSS/JS.",
      "4. Optimize for mobile and fast page load.",
      "</instructions>",
      "<examples>Hero section: festival name, tagline, countdown timer, date and a prominent 'Register Now' call-to-action.</examples>",
      "<output_format>Provide the design plan first, then the implementation code in a single HTML file with inline CSS/JS.</output_format>",
    ].join("\n");
  }

  if (intent === "coding") {
    return [
      "<role>You are a senior software engineer and code reviewer.</role>",
      "<task>Write a Python script that solves the stated problem.</task>",
      "<context>Target level: intermediate programmer. Assume the Python standard library only unless otherwise stated.</context>",
      "<instructions>",
      "1. Clarify inputs, outputs and edge cases up front.",
      "2. Include proper error handling and type hints.",
      "3. Write clean, well-commented code.",
      "4. End with a one-paragraph explanation of how to run it.",
      "</instructions>",
      "<output_format>Return the complete script in a single fenced code block, followed by the explanation.</output_format>",
    ].join("\n");
  }

  if (intent === "learning") {
    return [
      "<role>You are an experienced educator who explains complex topics in plain, intuitive language.</role>",
      "<task>Explain the concept clearly, from intuition to implementation.</task>",
      "<context>Audience is a learner with basic programming knowledge. Depth should go beyond surface-level, but start accessible.</context>",
      "<instructions>",
      "1. Start with the core intuition — why the concept exists.",
      "2. Provide a minimal concrete example.",
      "3. Explain how it works under the hood.",
      "4. End with one common pitfall or edge case.",
      "</instructions>",
      "<output_format>Use clear markdown headings and short paragraphs. Include one code block with a simple example.</output_format>",
    ].join("\n");
  }

  if (intent === "brainstorming") {
    return [
      "<role>You are a creative strategist who generates structured, evaluable ideas.</role>",
      `<task>Generate a diverse set of ideas around: ${prompt.trim()}.</task>`,
      "<context>Provide 6-10 varied ideas. Note which are practical, which are ambitious, and under what constraints each would succeed.</context>",
      "<instructions>",
      "1. Vary the approach — some technical, some unconventional.",
      "2. For each idea, give a one-line 'why it works' note.",
      "3. Rank them from most practical to most experimental.",
      "4. If any constraint is missing, flag it rather than assume.",
      "</instructions>",
      "<output_format>Bulleted list grouped by theme, with a short ranking at the end.</output_format>",
    ].join("\n");
  }

  return [
    "<role>You are an expert assistant who produces clear, high-quality answers.</role>",
    `<task>${prompt.trim()}</task>`,
    "<context>Provide only what is needed; avoid generic filler. If critical information is missing, flag it in your response rather than guess.</context>",
    "<instructions>",
    "1. Address the request directly.",
      "2. Flag any missing information instead of guessing.",
      "3. Keep the response concise and well-structured.",
    "</instructions>",
    "<output_format>Clear plain text with short paragraphs; use lists or code blocks where they genuinely help.</output_format>",
  ].join("\n");
}