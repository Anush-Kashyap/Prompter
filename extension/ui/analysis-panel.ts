import "./styles.css";
import type { AnalysisResult } from "../types";

const WINDOW_ID = "prompter-window";
const BACKDROP_ID = "prompter-backdrop";

export interface PanelOptions {
  mode?: string;
  onModeChange?: (mode: string) => void;
}

export function showAnalysisPanel(
  analysis: AnalysisResult,
  onReplace?: () => void,
  onCopy?: () => void,
  opts?: PanelOptions
): HTMLElement {
  closeAnalysisPanel();

  const score = analysis.score;
  const scoreColor = score >= 80 ? "#10a37f" : score >= 60 ? "#f39c12" : "#e74c3c";

  const window = document.createElement("div");
  window.id = WINDOW_ID;
  window.setAttribute("role", "dialog");
  window.setAttribute("aria-modal", "true");
  window.setAttribute("aria-label", "Prompt analysis");

  const mode = opts?.mode === "light" || opts?.mode === "deep" ? opts.mode : "balanced";

  window.innerHTML = `
    <div class="prompter-window-bar">
      <div class="prompter-window-title">Improve</div>
      <div class="prompter-mode-wrap">
        <label class="prompter-mode-label" for="prompter-mode">Mode</label>
        <select id="prompter-mode" class="prompter-mode" aria-label="Rewrite mode">
          <option value="light">Light</option>
          <option value="balanced">Balanced</option>
          <option value="deep">Deep</option>
        </select>
      </div>
      <button class="prompter-window-close" data-close aria-label="Close">×</button>
    </div>

    <div class="prompter-window-body">

      <div class="prompter-health">
        <div class="prompter-health-score" style="background: ${scoreColor};">${score}%</div>
        <div class="prompter-health-label">
          <div class="label">Prompt Health</div>
          <div class="desc">${getHealthDescription(score)}</div>
        </div>
      </div>

      <span class="prompter-intent-chip">${escapeHtml(formatIntent(analysis.intent))}</span>

      <div class="prompter-issues">
        <div class="prompter-issues-title ${analysis.issues.length === 0 ? "ok" : ""}">
          ${analysis.issues.length === 0 ? "✓ No issues detected" : "Issues Found"}
        </div>
        ${analysis.issues.map((issue) => {
          const cls = issue.severity === "critical" ? "prompter-issue--critical" : issue.severity === "optional" ? "prompter-issue--optional" : "";
          return `<div class="prompter-issue ${cls}">${escapeHtml(issue.message)}</div>`;
        }).join("")}
      </div>

      <div class="prompter-suggestion">
        <div class="prompter-suggestion-title">Suggested Prompt</div>
        <div class="prompter-suggestion-text">${escapeHtml(analysis.improved_prompt || "No suggestion available.")}</div>
      </div>

      <div class="prompter-explanation" id="prompter-explanation" style="display:none;">
        <div class="prompter-explanation-title">Why</div>
        <div class="prompter-explanation-text">${escapeHtml(analysis.explanation)}</div>
      </div>

      <div class="prompter-actions">
        <button class="prompter-btn prompter-btn-primary" id="prompter-replace-btn">Replace</button>
        <button class="prompter-btn prompter-btn-secondary" id="prompter-copy-btn">Copy</button>
        <button class="prompter-btn prompter-btn-outline" id="prompter-explain-btn">Why?</button>
      </div>

    </div>

    <div class="prompter-window-footer">
      ${analysis.model === "mock" ? '<span class="prompter-model-tag prompter-model-tag--offline">local fallback</span>' : ""}
      <span class="prompter-model-name">${escapeHtml(analysis.model)}</span>
      <span class="prompter-confidence">confidence ${Math.round(analysis.confidence * 100)}%</span>
    </div>
  `;

  window.querySelector("[data-close]")?.addEventListener("click", closeAnalysisPanel);
  window.querySelector("#prompter-replace-btn")?.addEventListener("click", () => {
    onReplace?.();
    closeAnalysisPanel();
  });
  window.querySelector("#prompter-copy-btn")?.addEventListener("click", () => onCopy?.());
  window.querySelector("#prompter-explain-btn")?.addEventListener("click", () => {
    const el = window.querySelector("#prompter-explanation") as HTMLElement | null;
    if (el) el.style.display = el.style.display === "none" ? "" : "none";
  });

  // Rewrite mode: preselect and notify the caller on change
  const modeSelect = window.querySelector<HTMLSelectElement>("#prompter-mode");
  if (modeSelect) {
    modeSelect.value = mode;
    modeSelect.addEventListener("change", () => {
      opts?.onModeChange?.(modeSelect.value);
    });
  }

  return mount(window);
}

export function showAnalysisError(message: string): HTMLElement {
  closeAnalysisPanel();

  const window = document.createElement("div");
  window.id = WINDOW_ID;
  window.setAttribute("role", "alertdialog");
  window.setAttribute("aria-modal", "true");

  window.innerHTML = `
    <div class="prompter-window-bar">
      <div class="prompter-window-title">Improve</div>
      <button class="prompter-window-close" data-close aria-label="Close">×</button>
    </div>
    <div class="prompter-window-body">
      <div class="prompter-error">${escapeHtml(message)}</div>
    </div>
  `;

  window.querySelector("[data-close]")?.addEventListener("click", closeAnalysisPanel);

  return mount(window);
}

export function closeAnalysisPanel(): void {
  const backdrop = document.getElementById(BACKDROP_ID);
  const window = document.getElementById(WINDOW_ID);
  if (window) window.remove();
  if (backdrop) backdrop.remove();
}

function mount(windowEl: HTMLElement): HTMLElement {
  const backdrop = document.createElement("div");
  backdrop.id = BACKDROP_ID;
  backdrop.appendChild(windowEl);
  document.body.appendChild(backdrop);

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) closeAnalysisPanel();
  });
  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAnalysisPanel();
  });
  backdrop.tabIndex = -1;
  backdrop.focus();

  return windowEl;
}

function getHealthDescription(score: number): string {
  if (score >= 80) return "Your prompt is clear and well-structured.";
  if (score >= 60) return "Good start — a few details would help.";
  return "Several important details are missing.";
}

function formatIntent(intent: string): string {
  return intent
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}