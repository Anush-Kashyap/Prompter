// Platform adapter interface + registry.
// Each chat product implements this so the content script stays platform-agnostic:
// it asks the current adapter how to find/read/replace the composer, which chat
// is open (for per-chat memory) and where the "New chat" button lives.

import type { ImageRef } from "../types";
import chatgpt from "./chatgpt";
import gemini from "./gemini";
import claude from "./claude";

export interface PlatformAdapter {
  name: string;
  /** Hostname suffixes this adapter claims, e.g. ["chatgpt.com"]. */
  hosts: string[];
  /** Find the chat input/composer. Returns null when not (yet) present. */
  findPromptInput(): HTMLElement | null;
  /** Read the current draft from the composer. */
  readCurrentPrompt(): string;
  /** Replace the composer's draft. Returns false when no input was found. */
  writePrompt(text: string): boolean;
  /** Stable conversation id from the URL for per-chat context (null = new chat). */
  getChatIdFromUrl(): string | null;
  /** Selectors that match the "New chat" button for context reset purposes. */
  getNewChatSelectors(): string[];
  /** Attached images in the composer. */
  getComposerImages(): ImageRef[];
}

const ADAPTERS: PlatformAdapter[] = [chatgpt, gemini, claude];

export function getAdapterForHost(hostname: string): PlatformAdapter | null {
  const host = hostname.toLowerCase();
  return ADAPTERS.find((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`))) || null;
}

export function getSupportedHosts(): string[] {
  return ADAPTERS.flatMap((a) => a.hosts);
}