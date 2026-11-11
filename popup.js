function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function validateLists(lists) {
  if (!Array.isArray(lists) || lists.some(item => !item || typeof item.name !== 'string' || !item.name.trim() || !Array.isArray(item.symbols) || item.symbols.some(s => typeof s !== 'string' || !s.trim()))) {
    throw new Error('Each list must have a name and an array of nonempty symbol strings.');
  }
  return lists;
}

const localContainer = document.getElementById("localListsContainer");
const cloudContainer = document.getElementById("cloudListsContainer");
const nameInput = document.getElementById("listNameInput");
const symbolsInput = document.getElementById("listSymbolsInput");
const autoReloadCheckbox = document.getElementById("autoReload");
const statusBar = document.getElementById("statusBar");

function setStatus(msg, isError = false) {
  statusBar.textContent = msg;
  statusBar.className = isError ? "status error" : "status";
}

function parseSymbols(raw) {
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function getActiveTvTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("tradingview.com")) {
    throw new Error("Focus an open tradingview.com tab first.");
  }
  return tab;
}

async function sendToTvTab(payload) {
  const tab = await getActiveTvTab();
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, payload, response => {
      if (chrome.runtime.lastError) {
        reject(new Error("Refresh your TradingView tab once to activate the extension."));
      } else if (!response || !response.ok) {
        reject(new Error(response?.error || "Unknown error in TradingView tab."));
      } else {
        resolve(response);
      }
    });
  });
}

async function getLocalLists() {
  const data = await chrome.storage.local.get({ watchlists: [], autoReload: true });
  autoReloadCheckbox.checked = data.autoReload;
  return data.watchlists;
}

async function saveLocalLists(watchlists) {
  validateLists(watchlists);
  await chrome.storage.local.set({ watchlists });
  await renderLocalLists();
}

async function renderLocalLists() {
  const lists = await getLocalLists();
  localContainer.innerHTML = "";

  if (lists.length === 0) {
    localContainer.innerHTML = `<span class="list-sub">No local lists saved yet.</span>`;
    return;
  }

  lists.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "list-item";

    const count = item.symbols.filter(s => !s.startsWith("###")).length;
    row.innerHTML = `
      <div class="list-meta" title="${escapeHtml(item.symbols.join(", "))}">
        <span class="list-title">${escapeHtml(item.name)}</span>
        <span class="list-sub">${count}/30 symbols · ${escapeHtml(item.symbols.slice(0, 3).join(", "))}</span>
      </div>
      <div class="actions">
        <button data-act="load" data-idx="${index}">Load</button>
        <button data-act="edit" data-idx="${index}" class="secondary">Edit</button>
        <button data-act="del" data-idx="${index}" class="danger">×</button>
      </div>
    `;
    localContainer.appendChild(row);
  });
}

localContainer.addEventListener("click", async e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const act = btn.dataset.act;
  const lists = await getLocalLists();
  const target = lists[idx];
  if (!target) return;

  if (act === "load") {
    try {
      setStatus(`Switching to "${target.name}"...`);
      const result = await sendToTvTab({
        action: "APPLY_LOCAL_LIST",
        name: target.name,
        symbols: target.symbols,
        autoReload: autoReloadCheckbox.checked
      });
      setStatus(result.warning || `Loaded "${target.name}" (${target.symbols.length} entries).`, Boolean(result.warning));
    } catch (err) {
      setStatus(err.message, true);
    }
  } else if (act === "edit") {
    nameInput.value = target.name;
    symbolsInput.value = target.symbols.join(",");
    setStatus(`Editing "${target.name}". Click Save to update.`);
  } else if (act === "del") {
    lists.splice(idx, 1);
    await saveLocalLists(lists);
    setStatus(`Deleted "${target.name}".`);
  }
});

document.getElementById("btnSaveList").addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const symbols = parseSymbols(symbolsInput.value);

  if (!name || symbols.length === 0) {
    return setStatus("Enter both a list name and at least one symbol.", true);
  }

  const lists = await getLocalLists();
  const existingIdx = lists.findIndex(l => l.name.toLowerCase() === name.toLowerCase());

  if (existingIdx >= 0) {
    lists[existingIdx].symbols = symbols;
  } else {
    lists.push({ name, symbols });
  }

  await saveLocalLists(lists);
  nameInput.value = "";
  symbolsInput.value = "";
  setStatus(`Saved "${name}" (${symbols.length} entries).`);
});

document.getElementById("btnCaptureActive").addEventListener("click", async () => {
  try {
    setStatus("Reading active watchlist from TradingView...");
    const res = await sendToTvTab({ action: "GET_CLOUD_LISTS" });
    const active = res.lists.find(l => l.active) || res.lists[0];
    if (!active) throw new Error("No custom watchlist found on account.");

    const lists = await getLocalLists();
    const capturedName = `${active.name || "Captured"} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    lists.push({ name: capturedName, symbols: active.symbols || [] });
    await saveLocalLists(lists);
    setStatus(`Captured "${capturedName}" locally.`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

async function loadCloudLists() {
  try {
    const res = await sendToTvTab({ action: "GET_CLOUD_LISTS" });
    cloudContainer.innerHTML = "";
    if (!res.lists || res.lists.length === 0) {
      cloudContainer.innerHTML = `<span class="list-sub">No cloud lists found.</span>`;
      return;
    }

    res.lists.forEach(cloudList => {
      const row = document.createElement("div");
      row.className = "list-item";
      const symCount = (cloudList.symbols || []).filter(s => !s.startsWith("###")).length;
      row.innerHTML = `
        <div class="list-meta" title="${escapeHtml((cloudList.symbols || []).join(", "))}">
          <span class="list-title">${escapeHtml(cloudList.name)} ${cloudList.active ? "●" : ""}</span>
          <span class="list-sub">ID: ${escapeHtml(cloudList.id)} · ${symCount} symbols</span>
        </div>
        <div class="actions">
          <button data-cloud-act="activate" data-id="${escapeHtml(cloudList.id)}" data-name="${escapeHtml(cloudList.name)}">Switch</button>
          <button data-cloud-act="backup" data-id="${escapeHtml(cloudList.id)}" class="secondary">Save Local</button>
        </div>
      `;
      row.dataset.symbols = JSON.stringify(cloudList.symbols || []);
      cloudContainer.appendChild(row);
    });
  } catch (err) {
    cloudContainer.innerHTML = `<span class="list-sub">${escapeHtml(err.message)}</span>`;
  }
}

cloudContainer.addEventListener("click", async e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const row = btn.closest(".list-item");
  const act = btn.dataset.cloudAct;
  const id = btn.dataset.id;
  const name = btn.dataset.name;
  const symbols = JSON.parse(row.dataset.symbols || "[]");

  if (act === "activate") {
    try {
      setStatus(`Unlocking cloud list "${name}"...`);
      const result = await sendToTvTab({
        action: "ACTIVATE_CLOUD_LIST",
        id,
        name,
        autoReload: autoReloadCheckbox.checked
      });
      setStatus(result.warning || `Switched active cloud list to "${name}".`, Boolean(result.warning));
    } catch (err) {
      setStatus(err.message, true);
    }
  } else if (act === "backup") {
    const lists = await getLocalLists();
    lists.push({ name: row.querySelector(".list-title").textContent.replace("●", "").trim(), symbols });
    await saveLocalLists(lists);
    setStatus("Cloned cloud list to local storage.");
  }
});

document.getElementById("btnRefreshCloud").addEventListener("click", loadCloudLists);

autoReloadCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ autoReload: autoReloadCheckbox.checked });
});

document.getElementById("btnExportJson").addEventListener("click", async () => {
  const lists = await getLocalLists();
  const blob = new Blob([JSON.stringify(lists, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tradingview-watchlists-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btnImportJson").addEventListener("click", () => {
  document.getElementById("fileImport").click();
});

document.getElementById("fileImport").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const content = ev.target.result.trim();
      const lists = await getLocalLists();
      if (file.name.endsWith(".json")) {
        const imported = validateLists(JSON.parse(content));
        if (Array.isArray(imported)) {
          await saveLocalLists([...lists, ...imported]);
          setStatus(`Imported ${imported.length} lists.`);
        }
      } else {
        // Plain .txt comma-separated file import
        const symbols = parseSymbols(content);
        lists.push({ name: file.name.replace(/\.txt$/i, ""), symbols });
        await saveLocalLists(lists);
        setStatus(`Imported TXT list "${file.name}".`);
      }
    } catch (err) {
      setStatus("Invalid import file format.", true);
    }
  };
  reader.readAsText(file);
});

// Initialize popup
renderLocalLists();
loadCloudLists();