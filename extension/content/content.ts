// Prompter Content Script - Main Entry Point
import "../ui/styles.css";
import { mockAnalyze } from "./detector";
import { injectUI } from "./injector";
import { showAnalysisPanel, showAnalysisError, closeAnalysisPanel } from "../ui/analysis-panel";
import { readCurrentPrompt, writePrompt } from "../adapters/chatgpt";
import type { AnalysisResult } from "../types";

export type RewriteMode = "light" | "balanced" | "deep";

const COOLDOWN_MS = 1500;

let improveButton: HTMLButtonElement | null = null;
let currentAnalysis: AnalysisResult | null = null;
let currentMode: RewriteMode = "balanced";
let lastPrompt = "";
let lastAnalyzeAt = 0;

function init(): void {
  // Check if we're on ChatGPT
  if (!window.location.hostname.includes("chatgpt.com")) return;

  // Restore the last-used rewrite mode (default Balanced)
  if (chrome.storage) {
    chrome.storage.local.get({ prompterMode: "balanced" }, (stored) => {
      if (stored && stored.prompterMode) currentMode = stored.prompterMode;
    });
  }

  // Inject the floating Improve button (always visible, bottom-right)
  injectUI().then((btn) => {
    if (!btn) return;
    improveButton = btn;
    improveButton.addEventListener("click", handleImproveClick);
    console.log("[Prompter] Initialized on ChatGPT");
  });
}

async function handleImproveClick(): Promise<void> {
  if (!improveButton || improveButton.disabled) return;

  // Debounce: ignore re-clicks shortly after the last analysis
  if (Date.now() - lastAnalyzeAt < COOLDOWN_MS) return;
  lastAnalyzeAt = Date.now();

  improveButton.classList.add("prompter-loading");
  improveButton.disabled = true;

  try {
    // Read current prompt from ChatGPT input
    const prompt = readCurrentPrompt();
    if (!prompt.trim()) {
      showAnalysisError("No prompt found in input. Type a prompt in ChatGPT first.");
      return;
    }
    lastPrompt = prompt;

    // Analyze via backend LLM; fall back to local mock if backend is down (spec Rule 11)
    const analysis = await analyzePrompt(prompt, currentMode);
    currentAnalysis = analysis;

    showAnalysisPanel(analysis, handleReplace, handleCopy, {
      mode: currentMode,
      onModeChange: handleModeChange
    });
  } catch (err) {
    console.error("[Prompter] Analysis failed:", err);
    showAnalysisError("Failed to analyze prompt.");
  } finally {
    if (improveButton) {
      improveButton.classList.remove("prompter-loading");
      improveButton.disabled = false;
    }
  }
}

async function handleModeChange(mode: RewriteMode): Promise<void> {
  currentMode = mode;
  try {
    await chrome.storage.local.set({ prompterMode: mode });
  } catch {
    // storage is optional; analysis still works
  }

  if (!lastPrompt || !improveButton) return;

  // Re-run analysis with the new mode and refresh the panel in place
  improveButton.classList.add("prompter-loading");
  improveButton.disabled = true;
  try {
    const analysis = await analyzePrompt(lastPrompt, currentMode);
    currentAnalysis = analysis;
    showAnalysisPanel(analysis, handleReplace, handleCopy, {
      mode: currentMode,
      onModeChange: handleModeChange
    });
  } catch (err) {
    console.error("[Prompter] Re-analysis failed:", err);
    showAnalysisError("Failed to re-analyze with this mode.");
  } finally {
    if (improveButton) {
      improveButton.classList.remove("prompter-loading");
      improveButton.disabled = false;
    }
  }
}

async function analyzePrompt(prompt: string, mode: RewriteMode): Promise<AnalysisResult> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "analyze", prompt, mode });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Background returned no data");
    }

    const json = response.data;
    if (!json || typeof json !== "object" || typeof (json as AnalysisResult).improved_prompt !== "string") {
      throw new Error("Backend returned an unexpected shape");
    }
    return json as AnalysisResult;
  } catch (err) {
    console.warn("[Prompter] Backend unavailable, using local mock:", err);
    return mockAnalyze(prompt);
  }
}

function handleReplace(): void {
  if (!currentAnalysis) return;

  const improvedPrompt = currentAnalysis.improved_prompt || readCurrentPrompt();
  const success = writePrompt(improvedPrompt);
  if (success) {
    console.log("[Prompter] Prompt replaced successfully");
    closeAnalysisPanel();
  } else {
    showAnalysisError("Failed to replace prompt.");
  }
}

function handleCopy(): void {
  if (!currentAnalysis) return;
  const improvedPrompt = currentAnalysis.improved_prompt || readCurrentPrompt();
  navigator.clipboard.writeText(improvedPrompt).then(() => {
    console.log("[Prompter] Copied to clipboard");
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}