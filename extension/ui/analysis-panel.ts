export function showAnalysisPanel(analysis: { intent: string; issues: string[]; confidence: number }) {
  // Remove existing panel if present
  const existing = document.getElementById("prompter-analysis-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "prompter-analysis-panel";
  panel.style.cssText = `
    position: fixed;
    bottom: 60px;
    right: 20px;
    z-index: 2147483647;
    width: 300px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    padding: 20px;
    font-family: sans-serif;
    max-height: 400px;
    overflow-y: auto;
  `;

  panel.innerHTML = \`
    <div style="font-size: 12px; color: #666; margin-bottom: 12px;">Prompt Health</div>
    <div style="font-size: 24px; font-weight: bold; margin-bottom: 12px;">${(analysis.confidence * 100).toFixed(0)}%</div>
    <div style="margin-bottom: 12px;">
      <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">Intent: ${analysis.intent}</div>
      ${analysis.issues.map((issue, i) => \`<div style="font-size: 12px; color: #e74c3c; margin: 4px 0;">⚠ ${issue}</div>\`).join("")}
    </div>
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee;">
      <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Suggested prompt:</div>
      <div style="background: #f8f9fa; padding: 10px; border-radius: 6; font-size: 13px; min-height: 60px;">
        Create a modern website for Tathva, a college technology festival. Design it for college students and prospective participants. Use a futuristic technology-focused visual direction and include sections for events, schedule, sponsors, registration and contact information.
      </div>
    </div>
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; display: flex; gap: 8px;">
      <button style="flex: 1; padding: 6px; background: #10a37f; color: white; border: none; border-radius: 6; font-size: 12px; cursor: pointer;">Replace</button>
      <button style="flex: 1; padding: 6px; background: #6c757d; color: white; border: none; border-radius: 6; font-size: 12px; cursor: pointer;">Copy</button>
      <button style="flex: 1; padding: 6px; background: #e74c3c; color: white; border: none; border-radius: 6; font-size: 12px; cursor: pointer;">Explain</button>
    </div>
  \`;

  document.body.appendChild(panel);
  return panel;
}
