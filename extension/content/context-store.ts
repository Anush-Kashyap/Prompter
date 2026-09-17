// Prompter Session Context Store
// Stores recent turns (prompt + images + analysis) in chrome.storage.session
// Cleared on browser close, survives page reloads.

import type { AnalysisResult } from "../types";

export interface ImageRef {
  type: "data-url" | "file-ref";
  data?: string;           // base64 data URL (for small images)
  fileName?: string;
  mimeType?: string;
  size?: number;
}

export interface SessionTurn {
  prompt: string;
  images: ImageRef[];
  analysis: AnalysisResult;
  timestamp: number;
  mode: "light" | "balanced" | "deep";
}

const STORAGE_KEY = "prompterSession";
const MAX_TURNS = 20;

function getSession(): Promise<SessionTurn[]> {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.session) {
      resolve([]);
      return;
    }
    chrome.storage.session.get({ [STORAGE_KEY]: [] }, (stored) => {
      resolve((stored && stored[STORAGE_KEY]) || []);
    });
  });
}

function setSession(turns: SessionTurn[]): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage || !chrome.storage.session) {
      resolve();
      return;
    }
    chrome.storage.session.set({ [STORAGE_KEY]: turns }, resolve);
  });
}

export async function addTurn(turn: SessionTurn): Promise<void> {
  const turns = await getSession();
  turns.unshift(turn);
  if (turns.length > MAX_TURNS) turns.length = MAX_TURNS;
  await setSession(turns);
}

export async function getRecentTurns(n: number): Promise<SessionTurn[]> {
  const turns = await getSession();
  return turns.slice(0, n);
}

export async function clearSession(): Promise<void> {
  await setSession([]);
}

export async function getSessionTurnCount(): Promise<number> {
  const turns = await getSession();
  return turns.length;
}