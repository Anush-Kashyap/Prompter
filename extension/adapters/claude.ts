// Anthropic Claude Platform Adapter (claude.ai)
//
// Claude's composer is a ProseMirror contenteditable div. It is mounted and
// unmounted as you navigate conversations, so every read/write resolves the
// editor fresh. Class names are hashed/unstable; attribute-based selectors
// (data-testid="composer-input") are the most reliable anchors.
//
// Conversation ids live in the URL as /chat/<uuid>.

import type { PlatformAdapter } from "./index";
import type { ImageRef } from "../types";
import { findVisibleInput, readEditableText, setTextareaValue, setContentEditableText, scanComposerImages } from "./shared";

const INPUT_SELECTORS = [
  'div[contenteditable="true"][data-testid="composer-input"]',
  'div[contenteditable="true"][data-testid]',
  'div[contenteditable="true"].ProseMirror',
  'div[contenteditable="true"][class*="composer"]',
  'div[contenteditable="true"][placeholder]',
  'textarea[placeholder*="Send a message" i]'
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
  return setContentEditableText(input, text);
}

export function getComposerImages(): ImageRef[] {
  return scanComposerImages();
}

const claude: PlatformAdapter = {
  name: "Claude",
  hosts: ["claude.ai"],
  findPromptInput,
  readCurrentPrompt,
  writePrompt,
  // Claude chats are /chat/<uuid>.
  getChatIdFromUrl: () => {
    const m = window.location.pathname.match(/(?:^|\/)chat\/([a-f0-9-]{8,36})/i);
    return m ? m[1] : null;
  },
  getNewChatSelectors: () => [
    'a[href="/new"]',
    'button[data-testid="new-chat"]',
    'button[aria-label*="New chat" i]',
    'a[aria-label*="New chat" i]'
  ],
  getComposerImages
};

export default claude;