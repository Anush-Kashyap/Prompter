// Shared helpers for platform adapters: safely reading/writing chat composer
// inputs (contenteditable editors: ProseMirror on Claude, Quill on Gemini,
// plain textarea fallbacks) and a page-wide image scanner that works for any
// platform that renders attachments as <img> with blob/data URLs.

import type { ImageRef } from "../types";

// Any element belonging to Prompter's own UI must be ignored by scanners.
export function isPrompterUi(node: Element | null): boolean {
  return !!node && !!node.closest(
    "#prompter-window, #prompter-backdrop, #prompter-improve-button, #prompter-tip, #prompter-help, #prompter-toast"
  );
}

export function isVisibleNode(el: Element): boolean {
  if (isPrompterUi(el)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 16 || rect.height < 16) return false; // tiny icons (emoji, favicons)
  return true;
}

// First visible match among multiple candidate selectors, in priority order.
export function findVisibleInput(selectors: string[]): HTMLElement | null {
  let fallback: HTMLElement | null = null;
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (isPrompterUi(el)) continue;
      if (!fallback) fallback = el;
      if (isVisibleNode(el)) return el;
    }
  }
  return fallback;
}

export function readEditableText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value;
  return (el.innerText || el.textContent || "").trim();
}

export function setTextareaValue(el: HTMLTextAreaElement, text: string): boolean {
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// Robust write for contenteditable editors (Claude's ProseMirror, Gemini's
// Quill). document.execCommand("insertText") drives the editor's real model;
// we fall back to innerText + synthetic events if execCommand is unavailable.
export function setContentEditableText(el: HTMLElement, text: string): boolean {
  el.focus();
  try {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("delete");
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {
    el.innerText = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

// Detect images attached in a composer by scanning the whole page for visible
// blob:/data: <img> thumbnails and CSS background-image uploads, deduped by URL
// and file name. Works across platforms because every chat app ultimately
// renders attachments as images with in-page URLs.
export function scanComposerImages(): ImageRef[] {
  const results: ImageRef[] = [];
  const seen = new Set<string>();

  const push = (img: HTMLImageElement, src: string): void => {
    if (!src || seen.has(src) || !isVisibleNode(img)) return;
    seen.add(src);
    const fileName =
      img.alt ||
      img.title ||
      img.getAttribute("data-file-name") ||
      img.closest("[data-file-name]")?.getAttribute("data-file-name") ||
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
  if (seen.size === 0) {
    document.querySelectorAll<HTMLImageElement>("img[src^='blob:'], img[src^='data:image/']").forEach((img) => {
      push(img, img.currentSrc || img.src);
    });
  }

  // Strategy 3: CSS/background-image uploads
  if (seen.size === 0) {
    const all = document.querySelectorAll<HTMLElement>("div, span, button");
    for (const el of all) {
      if (!isVisibleNode(el)) continue;
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?(blob:[^"')]+)["']?\)/);
      if (m) results.push({ type: "data-url", data: m[1], fileName: "image", mimeType: "image/*", size: 0 });
    }
  }

  return results;
}