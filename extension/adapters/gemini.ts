// Google Gemini Platform Adapter (gemini.google.com)
//
// Gemini's composer is a Quill rich-text editor inside a <rich-textarea>
// web component. The editable surface is a <div class="ql-editor" contenteditable>
// with the placeholder managed via the `ql-blank` class on the editor root.
//
// Conversation ids live in the URL as /app/<uuid>; the New Chat page is /app.

import type { PlatformAdapter } from "./index";
import type { ImageRef } from "../types";
import { findVisibleInput, readEditableText, setTextareaValue, setContentEditableText, scanComposerImages } from "./shared";

const INPUT_SELECTORS = [
  'rich-textarea div.ql-editor[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'textarea[aria-label="Enter a prompt for Gemini"]',
  '[aria-label="Enter a prompt for Gemini"]',
  'textarea[placeholder*="prompt" i]',
  'textarea'
];

export function findPromptInput(): HTMLElement | null {
  return findVisibleInput(INPUT_SELECTORS);
}

export function readCurrentPrompt(): string {
  const input = findPromptInput();
  if (!input) return "";
  return readEditableText(input);
}

export function writePrompt(text: string): boolean {
  const input = findPromptInput();
  if (!input) return false;
  if (input instanceof HTMLTextAreaElement) return setTextareaValue(input, text);

  const ok = setContentEditableText(input, text);
  // Quill swaps the placeholder via .ql-blank; drop it once we have content.
  if (ok) {
    const root = input.closest(".ql-editor") || input;
    root.classList?.remove("ql-blank");
  }
  return ok;
}

export function getComposerImages(): ImageRef[] {
  // Gemini renders attachments inside the composer; the generic whole-page scan
  // catches blob: thumbnails and Drive-style previews.
  return scanComposerImages();
}

const gemini: PlatformAdapter = {
  name: "Gemini",
  hosts: ["gemini.google.com", "bard.google.com"],
  findPromptInput,
  readCurrentPrompt,
  writePrompt,
  // Gemini chats are /app/<uuid>.
  getChatIdFromUrl: () => {
    const m = window.location.pathname.match(/(?:^|\/)app\/([a-f0-9-]{8,36})/i);
    return m ? m[1] : null;
  },
  getNewChatSelectors: () => [
    'a[href="/app"]',
    'a[href="/app/"]',
    'button[aria-label*="New chat" i]',
    'a[aria-label*="New chat" i]'
  ],
  getComposerImages
};

export default gemini;