// Prompter Content Script - Main Entry Point
import "../ui/styles.css";
import { mockAnalyze } from "./detector";
import { injectUI, showOnboardingTip, clearFabFirstRun } from "./injector";
import { showAnalysisPanel, showAnalysisLoading, showAnalysisError, closeAnalysisPanel } from "../ui/analysis-panel";
import { readCurrentPrompt, writePrompt, getComposerImages } from "../adapters/chatgpt";
import { addTurn, getRecentTurns, syncActiveChat, resetDraftForNewChat } from "./context-store";
import type { AnalysisResult, ImageRef, SessionTurn, AnalysisContext } from "../types";

export type RewriteMode = "light" | "balanced" | "deep";

const COOLDOWN_MS = 1500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX = 50;

let improveButton: HTMLButtonElement | null = null;
let currentAnalysis: AnalysisResult | null = null;
let currentMode: RewriteMode = "balanced";
let lastPrompt = "";
let lastAnalyzeAt = 0;
let modeChanging = false;

function init(): void {
  // Check if we're on ChatGPT
  if (!window.location.hostname.includes("chatgpt.com")) return;

  // Restore the last-used rewrite mode (default Balanced)
  if (chrome.storage) {
    chrome.storage.local.get({ prompterMode: "balanced" }, (stored) => {
      if (stored && stored.prompterMode) currentMode = stored.prompterMode;
    });
  }

  // Identify the active chat and load its context
  syncActiveChat().catch(() => {});

  // Watch for SPA navigation (ChatGPT is a single-page app):
  // patch pushState/replaceState so we detect chat switches without reloads.
  const patchNav = (fn: "pushState" | "replaceState") => {
    const orig = history[fn];
    history[fn] = function (...args) {
      const result = orig.apply(this, args);
      syncActiveChat().catch(() => {});
      return result;
    };
  };
  patchNav("pushState");
  patchNav("replaceState");
  window.addEventListener("popstate", () => syncActiveChat().catch(() => {}));

  // Reset draft context when the user clicks "New chat"
  document.addEventListener(
    "click",
    (e) => {
      const t = (e.target as HTMLElement).closest(
        '[data-testid="new-chat-button"], a[aria-label*="New chat" i], a[aria-label*="Start new chat" i]'
      );
      if (t) resetDraftForNewChat().catch(() => {});
    },
    true
  );

  // Inject the floating Improve button (always visible, bottom-right)
  injectUI().then((btn) => {
    if (!btn) return;
    improveButton = btn;
    improveButton.addEventListener("click", handleImproveClick);
    console.log("[Prompter] Initialized on ChatGPT");
    clearFabFirstRun();
    maybeShowOnboarding(btn);
  });

  // Keyboard command routed from the service worker (Ctrl/Cmd+Shift+Y)
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "improve-now") {
      handleImproveClick();
    }
  });
}

async function maybeShowOnboarding(btn: HTMLButtonElement): Promise<void> {
  if (!chrome.storage) return;
  const stored = await new Promise<{ prompterSeenTip?: boolean }>((resolve) => {
    chrome.storage.local.get({ prompterSeenTip: false }, resolve);
  });
  if (stored && stored.prompterSeenTip) return;
  chrome.storage.local.set({ prompterSeenTip: true });
  showOnboardingTip(btn, { shortcut: /Mac|iPhone|iPad/i.test(navigator.platform) ? "Cmd" : "Ctrl" });
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

    // Show a waiting panel immediately so the user knows analysis is running
    showAnalysisLoading();
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
  if (modeChanging) return;
  modeChanging = true;

  currentMode = mode;
  try {
    await chrome.storage.local.set({ prompterMode: mode });
  } catch {
    // storage is optional; analysis still works
  }

  if (!lastPrompt || !improveButton) {
    modeChanging = false;
    return;
  }

  // Keep the panel open but swap in a spinner while the new mode is analyzed
  showAnalysisLoading(`Re-analyzing in ${mode} mode…`);
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
    modeChanging = false;
  }
}

async function analyzePrompt(prompt: string, mode: RewriteMode): Promise<AnalysisResult> {
  // Make sure context is keyed to the correct chat before reading history
  const chatId = await syncActiveChat();

  // Gather session context and attached images
  const recentTurns = await getRecentTurns(3);
  const images = getComposerImages();

  // Cache key includes chat id + prompt + mode + image hashes, so cached
  // results never leak between different conversations.
  const imageHashes = images.map((img) => img.data?.slice(0, 50) || "").sort().join("|");
  const key = await promptHash(`${chatId}|${prompt}|${mode}|${imageHashes}`);

  // 1) Cache hit
  const cached = await cachedAnalysis(key);
  if (cached) {
    console.log("[Prompter] Using cached analysis");
    return { ...cached, cached: true };
  }

  // 2) Build context payload for backend (drop heavy data URLs — the backend
  //    only needs file names; we keep data locally for the cache key above)
  const slimImages = images.map((img) => ({
    type: img.type,
    fileName: img.fileName,
    mimeType: img.mimeType,
    size: img.size
  }));
  const context: AnalysisContext = { chatId, recentTurns, images: slimImages };

  // 3) Call backend via service worker
  try {
    const response = await chrome.runtime.sendMessage({ type: "analyze", prompt, mode, context });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Background returned no data");
    }

    const json = response.data;
    if (!json || typeof json !== "object" || typeof (json as AnalysisResult).improved_prompt !== "string") {
      throw new Error("Backend returned an unexpected shape");
    }

    const analysis = json as AnalysisResult;
    await storeAnalysis(key, analysis);

    // Save this turn to session context (metadata only — no data URLs)
    await addTurn({ prompt, images: slimImages, analysis, timestamp: Date.now(), mode });

    return analysis;
  } catch (err) {
    console.warn("[Prompter] Backend unavailable, using local mock:", err);
    const analysis = mockAnalyze(prompt, slimImages.length);
    await storeAnalysis(key, analysis);
    await addTurn({ prompt, images: slimImages, analysis, timestamp: Date.now(), mode });
    return analysis;
  }
}

interface CacheEntry {
  analysis: AnalysisResult;
  ts: number;
}

interface CacheMap {
  [key: string]: CacheEntry;
}

async function promptHash(key: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(key);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback: stable-ish hash if SubtleCrypto is unavailable
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }
}

async function cachedAnalysis(key: string): Promise<AnalysisResult | null> {
  if (!chrome.storage) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get({ prompterCache: {} }, (stored) => {
      const cache: CacheMap = (stored && stored.prompterCache) || {};
      const entry = cache[key];
      if (!entry || !entry.analysis || Date.now() - entry.ts > CACHE_TTL_MS) {
        return resolve(null);
      }
      resolve(entry.analysis);
    });
  });
}

async function storeAnalysis(key: string, analysis: AnalysisResult): Promise<void> {
  if (!chrome.storage) return;
  return new Promise((resolve) => {
    chrome.storage.local.get({ prompterCache: {} }, (stored) => {
      const cache: CacheMap = (stored && stored.prompterCache) || {};
      cache[key] = { analysis, ts: Date.now() };

      // LRU-ish eviction: drop oldest entries beyond CACHE_MAX
      const keys = Object.keys(cache);
      if (keys.length > CACHE_MAX) {
        keys
          .slice()
          .sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))
          .slice(0, keys.length - CACHE_MAX)
          .forEach((k) => delete cache[k]);
      }

      chrome.storage.local.set({ prompterCache: cache }, () => {
        resolve();
      });
    });
  });
}

function handleReplace(edited?: string): void {
  if (!currentAnalysis) return;

  const improvedPrompt = (edited && edited.trim()) || currentAnalysis.improved_prompt || readCurrentPrompt();
  const success = writePrompt(improvedPrompt);
  if (success) {
    console.log("[Prompter] Prompt replaced successfully");
    closeAnalysisPanel();
  } else {
    showAnalysisError("Failed to replace prompt.");
  }
}

function handleCopy(edited?: string): void {
  if (!currentAnalysis) return;
  const improvedPrompt = (edited && edited.trim()) || currentAnalysis.improved_prompt || readCurrentPrompt();
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