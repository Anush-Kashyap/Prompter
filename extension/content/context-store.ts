// Prompter Per-Chat Context Store
// Tracks context per ChatGPT conversation so each chat has its own memory:
//   - Different chats => different ids (from the /c/<uuid> URL)
//   - Opening a chat again reloads its turns
//   - A brand-new chat starts with empty context
// Drafts (before the first message is sent, the URL has no /c/<uuid>) get a
// temporary id that is migrated to the real chat id once the chat exists.
// Data lives in chrome.storage.local so it survives browser restarts.

import type { AnalysisResult, ImageRef, SessionTurn } from "../types";

const CHATS_KEY = "prompterChats";
const META_KEY = "prompterChatMeta";
const MAX_TURNS = 20;
const MAX_CHATS = 30;

interface ChatMeta {
  kind: "chat" | "draft";
  id: string;
  url: string;
  at: number;
}

type ChatMap = Record<string, SessionTurn[]>;

// ChatGPT conversation ids appear in the URL as /c/<uuid>.
export function getChatIdFromUrl(): string | null {
  const m = window.location.pathname.match(/(?:^|\/)c\/([a-f0-9-]{8,36})/i);
  return m ? m[1] : null;
}

function getMeta(): Promise<ChatMeta | null> {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get({ [META_KEY]: null }, (stored) => {
      resolve(stored && stored[META_KEY] ? stored[META_KEY] : null);
    });
  });
}

function setMeta(meta: ChatMeta | null): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) return resolve();
    chrome.storage.local.set({ [META_KEY]: meta }, () => resolve());
  });
}

function getChats(): Promise<ChatMap> {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get({ [CHATS_KEY]: {} }, (stored) => {
      resolve((stored && stored[CHATS_KEY]) || {});
    });
  });
}

function setChats(chats: ChatMap): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.local) return resolve();
    chrome.storage.local.set({ [CHATS_KEY]: chats }, () => resolve());
  });
}

function readChat(chats: ChatMap, id: string): SessionTurn[] {
  return chats[id] || [];
}

// Decide which chat we belong to right now, migrating draft context when the
// first message turns it into a real chat (URL gains /c/<uuid>).
export async function syncActiveChat(): Promise<string> {
  const urlId = getChatIdFromUrl();
  const url = window.location.pathname;
  const meta = await getMeta();

  if (urlId) {
    // A real chat is open.
    if (meta && meta.kind === "draft" && meta.id) {
      // First message was just sent: carry the draft's turns over.
      const chats = await getChats();
      const draftTurns = readChat(chats, meta.id);
      if (draftTurns.length) {
        const existing = readChat(chats, urlId);
        chats[urlId] = [...draftTurns, ...existing].slice(0, MAX_TURNS);
        delete chats[meta.id];
        await setChats(chats);
      }
    }
    if (!meta || meta.kind !== "chat" || meta.id !== urlId) {
      await setMeta({ kind: "chat", id: urlId, url, at: Date.now() });
    }
    return urlId;
  }

  // No chat id in the URL: brand-new chat page (or a reload of it).
  if (meta && meta.kind === "draft" && meta.url === url && meta.id) {
    return meta.id; // still the same new-chat page
  }
  const id = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await setMeta({ kind: "draft", id, url, at: Date.now() });
  return id;
}

// User clicked "New chat": drop any draft context so the next page is fresh.
export async function resetDraftForNewChat(): Promise<void> {
  const meta = await getMeta();
  if (!meta) return;
  if (meta.kind === "draft" && meta.id) {
    const chats = await getChats();
    if (chats[meta.id]) {
      delete chats[meta.id];
      await setChats(chats);
    }
  }
  await setMeta(null);
}

export async function addTurn(turn: SessionTurn): Promise<void> {
  const id = await syncActiveChat();
  const chats = await getChats();
  const turns = readChat(chats, id).slice(0, MAX_TURNS - 1);
  turns.unshift(turn);
  chats[id] = turns;
  await pruneChats(chats, id);
  await setChats(chats);
}

export async function getRecentTurns(n: number): Promise<SessionTurn[]> {
  const chats = await getChats();
  const meta = await getMeta();
  if (!meta || !meta.id) return [];
  return readChat(chats, meta.id).slice(0, n);
}

export async function clearActiveChat(): Promise<void> {
  const meta = await getMeta();
  if (!meta || !meta.id) return;
  const chats = await getChats();
  if (chats[meta.id]) {
    delete chats[meta.id];
    await setChats(chats);
  }
}

// Keep storage bounded: newest MAX_CHATS survive, plus the active one.
async function pruneChats(chats: ChatMap, activeId: string): Promise<void> {
  const keys = Object.keys(chats);
  if (keys.length <= MAX_CHATS) return;
  const sorted = keys
    .filter((k) => k !== activeId)
    .sort((a, b) => {
      const ta = chats[a] && chats[a][0] ? chats[a][0].timestamp : 0;
      const tb = chats[b] && chats[b][0] ? chats[b][0].timestamp : 0;
      return ta - tb; // oldest first
    });
  const toRemove = sorted.slice(0, keys.length - MAX_CHATS);
  toRemove.forEach((k) => delete chats[k]);
}

export { MAX_TURNS };
export type { ImageRef, SessionTurn, AnalysisResult };