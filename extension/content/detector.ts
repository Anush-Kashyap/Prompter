export function detectPrompt(prompt: string): { intent: string; issues: string[]; confidence: number } {
  const result: { intent: string; issues: string[]; confidence: number } = {
    intent: "",
    issues: [],
    confidence: 0.8
  };

  const lower = prompt.toLowerCase().trim();

  // Detect intent category
  if (/(code|program|function|script|bug|error|fix|debug)/.test(lower)) {
    result.intent = "coding";
    result.issues.push("Consider adding language and framework");
    result.confidence = 0.9;
  } else if (/(write|create|build|make)/.test(lower) && /(website|web|page|app)/.test(lower)) {
    result.intent = "website_design";
    result.issues.push("Missing target audience and sections");
    result.confidence = 0.85;
  } else if /(explain|learn|understand)/.test(lower) {
    result.intent = "learning";
    result.issues.push("Missing target audience and desired depth");
    result.confidence = 0.88;
  } else if /(brainstorm|ideas|concepts)/.test(lower) {
    result.intent = "brainstorming";
    result.issues.push("Consider adding constraints and evaluation criteria");
    result.confidence = 0.8;
  } else {
    result.intent = "other";
  }

  // Check for missing context
  if (!/(for|using|with|in|on)/.test(lower) && result.intent !== "other") {
    result.issues.push("Consider adding more context");
  }

  // Check for ambiguity
  if (/(better|improve|optimize|fix this)/.test(lower)) {
    result.issues.push("Prompt is ambiguous - specify what "better" means");
  }

  return result;
}
