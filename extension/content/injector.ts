// Prompter Floating Action Button (fixed bottom-right)
// The FAB is always visible regardless of scroll or input state.

export async function injectUI(): Promise<HTMLButtonElement> {
  // Check if button already exists
  let button = document.getElementById("prompter-improve-button") as HTMLButtonElement | null;
  if (button) return button;

  button = document.createElement("button");
  button.id = "prompter-improve-button";
  button.textContent = "Improve";
  button.title = "Improve prompt with Prompter";
  button.setAttribute("aria-label", "Improve prompt with Prompter");

  // Mark for first-run pulse animation
  button.classList.add("prompter-first-run");

  document.body.appendChild(button);

  return button;
}

export function getImproveButton(): HTMLButtonElement | null {
  return document.getElementById("prompter-improve-button") as HTMLButtonElement | null;
}

export function clearFabFirstRun(): void {
  const button = getImproveButton();
  button?.classList.remove("prompter-first-run");
}

// One-time onboarding tooltip anchored above the FAB.
export function showOnboardingTip(anchor: HTMLElement, opts: { shortcut?: string } = {}): void {
  if (document.getElementById("prompter-tip")) return;

  const shortcut = opts.shortcut || "Ctrl";

  const tip = document.createElement("div");
  tip.id = "prompter-tip";
  tip.setAttribute("role", "note");
  tip.innerHTML = `
    <span class="prompter-tip-body">Click <b>✦ Improve</b> or press <kbd>${shortcut}+Shift+Y</kbd> to turn any prompt into a structured expert prompt.</span>
    <button class="prompter-tip-close" aria-label="Dismiss">×</button>
  `;

  document.body.appendChild(tip);

  const close = () => {
    tip.classList.add("prompter-tip--out");
    setTimeout(() => tip.remove(), 200);
  };

  tip.querySelector(".prompter-tip-close")?.addEventListener("click", close);
  anchor.addEventListener("click", close, { once: true });

  setTimeout(close, 8000);

  const rect = anchor.getBoundingClientRect();
  tip.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  tip.style.bottom = `${window.innerHeight - rect.top + 12}px`;
}