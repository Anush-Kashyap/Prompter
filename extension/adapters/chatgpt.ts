import { readCurrentPrompt, detectPrompt } from "../content/detector";
import { injectUI, showAnalysisPanel } from "../content/ui-analysis-panel";

// Message listener for analysis requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzePrompt") {
    const prompt = readCurrentPrompt();
    if (!prompt.trim()) {
      sendResponse({ success: false, error: "No prompt found" });
      return;
    }

    const analysis = detectPrompt(prompt);
    sendResponse({ success: true, analysis });
  } else if (message.action === "showPanel") {
    const analysis = message.analysis;
    if (analysis) {
      showAnalysisPanel(analysis);
    }
    sendResponse({ success: true });
  }
  return true;
});

// Auto-detect when page loads
setTimeout(() => {
  const prompt = readCurrentPrompt();
  if (prompt.trim()) {
    chrome.runtime.sendMessage({ action: "analyzePrompt" }, response => {
      if (response.success && response.analysis) {
        showAnalysisPanel(response.analysis);
      }
    });
  }
}, 1000);

