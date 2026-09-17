// ChatGPT Platform Adapter

import type { PlatformAdapter } from "./index";
import type { ImageRef } from "../types";
import { findVisibleInput, readEditableText, setTextareaValue, setContentEditableText, scanComposerImages } from "./shared";

export function findPromptInput(): HTMLElement | null {
  // ChatGPT uses a ProseMirror contenteditable div (primary)
  return findVisibleInput([
    'div#prompt-textarea.ProseMirror[contenteditable="true"]',
    'textarea#wcDTda_fallbackTextarea',
    'textarea[placeholder*="Ask anything"][data-id="root"]',
    'div[contenteditable="true"][data-id="root"]',
    'textarea[placeholder*="Ask anything"]'
  ]);
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
  return setContentEditableText(input, text);
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

export function getComposerImages(): ImageRef[] {
  return scanComposerImages();
}

const chatgpt: PlatformAdapter = {
  name: "ChatGPT",
  hosts: ["chatgpt.com", "chat.openai.com"],
  findPromptInput,
  readCurrentPrompt,
  writePrompt,
  // ChatGPT conversation ids appear in the URL as /c/<uuid>.
  getChatIdFromUrl: () => {
    const m = window.location.pathname.match(/(?:^|\/)c\/([a-f0-9-]{8,36})/i);
    return m ? m[1] : null;
  },
  getNewChatSelectors: () => [
    '[data-testid="new-chat-button"]',
    'a[aria-label*="New chat" i]',
    'a[aria-label*="Start new chat" i]'
  ],
  getComposerImages
};

export default chatgpt;