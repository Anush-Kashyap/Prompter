export async function injectUI(): Promise<HTMLButtonElement> {
  // Check if button already exists
  let button = document.getElementById("prompter-improve-button");
  if (button) return button;

  button = document.createElement("button");
  button.id = "prompter-improve-button";
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    background: #10a37f;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 12px;
    font-family: sans-serif;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  `;
  button.textContent = "✦ Improve";
  button.title = "Improve prompt with Prompter";

  document.body.appendChild(button);
  return button;
}
