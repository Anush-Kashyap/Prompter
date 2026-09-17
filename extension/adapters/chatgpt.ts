// ChatGPT Platform Adapter
// Responsibilities: detect input, read prompt, inject UI, replace prompt

import type { ImageRef } from "../types";

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

// Detect images attached in the ChatGPT composer.
// ChatGPT renders pasted/dropped images as blob: <img> thumbnails near the
// input, so instead of guessing data-testid values we scan the whole page for
// visible blob/data images and dedupe by source URL.
export function getComposerImages(): ImageRef[] {
  const results: ImageRef[] = [];
  const seen = new Set<string>();

  const isVisible = (el: Element): boolean => {
    if (el.closest("#prompter-window, #prompter-backdrop, #prompter-improve-button, #prompter-tip")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) return false; // tiny icons (emoji, favicons)
    return true;
  };

  const push = (img: HTMLImageElement, src: string): void => {
    if (!src || seen.has(src) || !isVisible(img)) return;
    seen.add(src);
    const fileName =
      img.alt ||
      img.title ||
      img.getAttribute("data-file-name") ||
      (img.closest("[data-file-name]")?.getAttribute("data-file-name")) ||
      "image";
    results.push({ type: "data-url", data: src, fileName, mimeType: "image/*", size: 0 });
  };

  // Strategy 1: known preview wrapper patterns (fast path)
  const previews = document.querySelectorAll<HTMLImageElement>(
    '[data-testid="file-upload-preview"] img, ' +
    '[data-testid*="attachment"] img, ' +
    '[data-testid*="composer-attachment"] img, ' +
    '[data-testid*="file-thumb"] img, ' +
    '.composer-attachment img, ' +
    '.media-thumb img'
  );
  previews.forEach((img) => push(img, img.currentSrc || img.src));

  // Strategy 2: any visible blob:/data: image anywhere (covers pasted images)
  // Blob URLs are created in-page only for real uploads, so this is safe.
  if (seen.size === 0) {
    document.querySelectorAll<HTMLImageElement>("img[src^='blob:'], img[src^='data:image/']").forEach((img) => {
      push(img, img.currentSrc || img.src);
    });
  }

  // Strategy 3: CSS/background-image uploads (e.g. <div style="background-image:url(blob:...)">)
  if (seen.size === 0) {
    const all = document.querySelectorAll<HTMLElement>("div, span, button");
    for (const el of all) {
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?(blob:[^"')]+)["']?\)/);
      if (m && isVisible(el)) {
        results.push({ type: "data-url", data: m[1], fileName: "image", mimeType: "image/*", size: 0 });
      }
    }
  }

  return results;
}