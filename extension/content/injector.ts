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

  document.body.appendChild(button);

  return button;
}

export function getImproveButton(): HTMLButtonElement | null {
  return document.getElementById("prompter-improve-button") as HTMLButtonElement | null;
}