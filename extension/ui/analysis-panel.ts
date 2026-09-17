import "./styles.css";
import type { AnalysisResult } from "../types";

const WINDOW_ID = "prompter-window";
const BACKDROP_ID = "prompter-backdrop";

let restoreFocusEl: HTMLElement | null = null;

export interface PanelOptions {
  mode?: string;
  onModeChange?: (mode: string) => void;
}

export function showAnalysisPanel(
  analysis: AnalysisResult,
  onReplace?: (text?: string) => void,
  onCopy?: (text?: string) => void,
  opts?: PanelOptions
): HTMLElement {
  closeAnalysisPanel();

  const score = analysis.score;
  const scoreClass = score >= 80 ? "prompter-health-score--high" : score >= 60 ? "prompter-health-score--mid" : "prompter-health-score--low";

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
        <div class="prompter-health-score ${scoreClass}">${score}%</div>
        <div class="prompter-health-label">
          <div class="label">Prompt Health</div>
          <div class="desc">${getHealthDescription(score)}</div>
        </div>
      </div>

      <div class="prompter-chips">
        <span class="prompter-intent-chip">${escapeHtml(formatIntent(analysis.intent))}</span>
        ${analysis.output_format && analysis.output_format !== "other" ? `<span class="prompter-format-chip">${escapeHtml(formatFormat(analysis.output_format))}</span>` : ""}
        ${analysis.visual_context ? `<span class="prompter-visual-chip">🖼️ ${escapeHtml(analysis.visual_context.slice(0, 40))}${analysis.visual_context.length > 40 ? "…" : ""}</span>` : ""}
      </div>

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
        <div class="prompter-suggestion-head">
          <div class="prompter-suggestion-title">Suggested Prompt</div>
          <button class="prompter-edit-toggle" id="prompter-edit-btn" type="button">Edit</button>
          <button class="prompter-edit-reset" id="prompter-reset-btn" type="button" hidden>Reset</button>
        </div>
        ${structuredPromptHtml(analysis.improved_prompt || "No suggestion available.")}
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
      ${analysis.cached ? '<span class="prompter-model-tag prompter-model-tag--cached">cached</span>' : ""}
      <span class="prompter-model-name">${escapeHtml(analysis.model)}</span>
      <span class="prompter-confidence">confidence ${Math.round(analysis.confidence * 100)}%</span>
    </div>
  `;

  window.querySelector("[data-close]")?.addEventListener("click", closeAnalysisPanel);
  window.querySelector("#prompter-replace-btn")?.addEventListener("click", () => {
    onReplace?.(collectEditedPrompt(window));
    closeAnalysisPanel();
  });
  window.querySelector("#prompter-copy-btn")?.addEventListener("click", () => {
    onCopy?.(collectEditedPrompt(window));
  });
  window.querySelector("#prompter-explain-btn")?.addEventListener("click", () => {
    const el = window.querySelector("#prompter-explanation") as HTMLElement | null;
    if (el) el.style.display = el.style.display === "none" ? "" : "none";
  });

  initSuggestionEditing(window);

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

export function showAnalysisLoading(label = "Analyzing your prompt…"): HTMLElement {
  closeAnalysisPanel();

  const window = document.createElement("div");
  window.id = WINDOW_ID;
  window.setAttribute("role", "status");
  window.setAttribute("aria-modal", "true");
  window.setAttribute("aria-label", "Loading analysis");

  window.innerHTML = `
    <div class="prompter-window-bar">
      <div class="prompter-window-title">Improve</div>
      <button class="prompter-window-close" data-close aria-label="Close">×</button>
    </div>
    <div class="prompter-window-body prompter-loading-body">
      <div class="prompter-spinner" aria-hidden="true"></div>
      <div class="prompter-loading-text">${escapeHtml(label)}</div>
    </div>
  `;

  window.querySelector("[data-close]")?.addEventListener("click", closeAnalysisPanel);

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
  if (restoreFocusEl && document.contains(restoreFocusEl)) restoreFocusEl.focus();
  restoreFocusEl = null;
}

// ── Editable suggestion ("edit before replace") ─────────────

function initSuggestionEditing(windowEl: HTMLElement): void {
  const editBtn = windowEl.querySelector<HTMLButtonElement>("#prompter-edit-btn");
  const resetBtn = windowEl.querySelector<HTMLButtonElement>("#prompter-reset-btn");
  const editableNodes = Array.from(
    windowEl.querySelectorAll<HTMLElement>(".prompter-pt-text, .prompter-suggestion-text")
  );
  const originals = new Map<HTMLElement, string>();
  editableNodes.forEach((n) => originals.set(n, n.textContent ?? ""));
  const container = windowEl.querySelector<HTMLElement>(".prompter-pt, .prompter-suggestion-text");

  const setEditing = (on: boolean): void => {
    editableNodes.forEach((n) => {
      if (on) n.setAttribute("contenteditable", "true");
      else n.removeAttribute("contenteditable");
    });
    container?.classList.toggle("prompter-editing", on);
    if (editBtn) {
      editBtn.textContent = on ? "Done" : "Edit";
      editBtn.setAttribute("aria-pressed", String(on));
      if (on) editBtn.focus();
    }
    if (resetBtn) resetBtn.hidden = !on;
    if (!on && editableNodes[0]) editableNodes[0].blur();
  };

  editBtn?.addEventListener("click", () => {
    const editing = container?.classList.contains("prompter-editing");
    setEditing(!editing);
  });
  resetBtn?.addEventListener("click", () => {
    editableNodes.forEach((n) => {
      const original = originals.get(n);
      if (original != null) n.textContent = original;
    });
  });
}

// Rebuild the raw `<tag>…</tag>` prompt from (potentially edited) DOM.
function collectEditedPrompt(windowEl: HTMLElement): string {
  const pt = windowEl.querySelector<HTMLElement>(".prompter-pt");
  if (pt) {
    const parts: string[] = [];
    for (const child of Array.from(pt.children)) {
      if (child.classList.contains("prompter-pt-section")) {
        const tag = child.getAttribute("data-tag") || "section";
        const text = child.querySelector<HTMLElement>(".prompter-pt-text")?.textContent?.trim() || "";
        if (!text) continue;
        parts.push(`<${tag}>`, text, `</${tag}>`);
      } else if (child.classList.contains("prompter-pt-text")) {
        const text = child.textContent?.trim() || "";
        if (text) parts.push(text);
      }
    }
    return parts.join("\n");
  }
  const plain = windowEl.querySelector<HTMLElement>(".prompter-suggestion-text");
  return (plain?.textContent ?? "").trim();
}

function mount(windowEl: HTMLElement): HTMLElement {
  const backdrop = document.createElement("div");
  backdrop.id = BACKDROP_ID;
  backdrop.appendChild(windowEl);
  document.body.appendChild(backdrop);

  const focusable = () =>
    Array.from(
      windowEl.querySelectorAll<HTMLElement>("button, select, textarea, input, [href], [tabindex]:not([tabindex='-1'])")
    ).filter((el) => !el.hasAttribute("disabled"));

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) closeAnalysisPanel();
  });

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      const editing = windowEl.querySelector(".prompter-pt.prompter-editing, .prompter-suggestion-text.prompter-editing");
      if (editing) {
        // Exit edit mode instead of closing the panel
        windowEl.querySelector<HTMLButtonElement>("#prompter-edit-btn")?.click();
        return;
      }
      closeAnalysisPanel();
    }
    if (e.key === "Tab") {
      const els = focusable();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  backdrop.addEventListener("keydown", onKeydown);

  // Remember who to restore focus to, then move focus into the panel
  restoreFocusEl = (document.activeElement as HTMLElement) || null;
  backdrop.tabIndex = -1;
  const first = focusable()[0];
  if (first) first.focus();
  else backdrop.focus();

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

function formatFormat(fmt: string): string {
  const map: Record<string, string> = {
    code: "</> Code",
    json: "{ } JSON",
    markdown: "# Markdown",
    bullets: "• Bullets",
    table: "⊞ Table",
    other: "Text"
  };
  return map[fmt] || fmt;
}

// Render an Anthropic-style tagged prompt (<role>, <task>, ...) as labelled
// sections. Falls back to plain text when no tags are present.
function structuredPromptHtml(text: string): string {
  const labels: Record<string, string> = {
    role: "Role",
    task: "Task",
    context: "Context",
    instructions: "Instructions",
    examples: "Examples",
    output_format: "Output Format",
    visual_context: "Visual Context"
  };
  const re = /<\s*(role|task|context|instructions|examples|output_format|visual_context)\s*>\s*([\s\S]*?)\s*<\s*\/\s*\1\s*>/g;

  const parts: string[] = [];
  let last = 0;
  let matched = false;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const pre = text.slice(last, m.index).trim();
      if (pre) parts.push(`<div class="prompter-pt-text">${escapeHtml(pre)}</div>`);
    }
    parts.push(
      `<div class="prompter-pt-section" data-tag="${m[1]}">` +
        `<div class="prompter-pt-label">${escapeHtml(labels[m[1]] || m[1])}</div>` +
        `<div class="prompter-pt-text">${escapeHtml(m[2])}</div>` +
        "</div>"
    );
    last = re.lastIndex;
    matched = true;
  }

  const tail = text.slice(last).trim();
  if (tail) parts.push(`<div class="prompter-pt-text">${escapeHtml(tail)}</div>`);

  if (!matched) {
    return `<div class="prompter-suggestion-text">${escapeHtml(text)}</div>`;
  }
  return `<div class="prompter-pt">${parts.join("\n")}</div>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}