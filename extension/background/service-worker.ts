// Prompter Background Service Worker (Manifest V3)
// Routes /analyze calls to the backend — avoids mixed-content blocking
// (content script runs on https, backend is http://localhost).

const BACKEND_URL = "http://localhost:3001";
const TIMEOUT_MS = 30000;

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Prompter] Extension installed");
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "improve-prompt") return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || tab.id == null) return;
    chrome.tabs
      .sendMessage(tab.id, { type: "improve-now" })
      .catch(() => {
        // No content script on this page — ignore.
      });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "analyze") {
    handleAnalyze(message.prompt, message.mode)
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  return false;
});

async function handleAnalyze(prompt, mode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(`Backend HTTP ${resp.status}: ${body.error || ""}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}
