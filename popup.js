const toggle = document.getElementById("enabled-toggle");
const reloadBtn = document.getElementById("reload-tab");
const scopeInputs = document.querySelectorAll('input[name="scope"]');

chrome.storage.local.get({ enabled: true, scope: "all" }, (data) => {
  toggle.checked = data.enabled !== false;
  const scope = data.scope === "claude-only" ? "claude-only" : "all";
  scopeInputs.forEach((input) => {
    input.checked = input.value === scope;
  });
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});

scopeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) chrome.storage.local.set({ scope: input.value });
  });
});

reloadBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.reload(tab.id);
});
