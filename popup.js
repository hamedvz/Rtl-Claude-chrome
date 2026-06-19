const toggle = document.getElementById("enabled-toggle");
const reloadBtn = document.getElementById("reload-tab");

chrome.storage.sync.get({ enabled: true }, (data) => {
  toggle.checked = data.enabled !== false;
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});

reloadBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.reload(tab.id);
});
