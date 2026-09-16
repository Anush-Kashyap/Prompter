// ChatGPT Platform Adapter
// Responsibilities: detect input, read prompt, inject UI, replace prompt

export function findPromptInput(): HTMLElement | null {
  // ChatGPT uses a ProseMirror contenteditable div (primary)
  const proseMirror = document.querySelector('div#prompt-textarea.ProseMirror[contenteditable="true"]');
  if (proseMirror) return proseMirror as HTMLElement;

  // Fallback: hidden textarea (sometimes used)
  const fallback = document.querySelector('textarea#wcDTda_fallbackTextarea');
  if (fallback) return fallback as HTMLTextAreaElement;

  // Generic fallback
  const anyEditable = document.querySelector('div[contenteditable="true"][data-id="root"], textarea[placeholder*="Ask anything"]');
  if (anyEditable) return anyEditable as HTMLElement;

  return null;
}

export function readCurrentPrompt(): string {
  const input = findPromptInput();
  if (!input) return "";

  if (input instanceof HTMLTextAreaElement) {
    return input.value;
  }
  // ProseMirror contenteditable
  return input.textContent || input.innerText || "";
}

export function writePrompt(text: string): boolean {
  const input = findPromptInput();
  if (!input) return false;

  if (input instanceof HTMLTextAreaElement) {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // ProseMirror: set textContent and fire input event
  input.textContent = text;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  // Also try innerText for ProseMirror
  input.innerText = text;
  return true;
}

export function getInputPosition(): { top: number; left: number; width: number } | null {
  const input = findPromptInput();
  if (!input) return null;

  const rect = input.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width
  };
}