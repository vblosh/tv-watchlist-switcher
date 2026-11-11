(() => {
  const API_BASE = "https://www.tradingview.com/api/v1/symbols_list";

  async function checkedFetch(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`TradingView request failed with HTTP ${response.status}: ${new URL(url).pathname}`);
    return response;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : "";
  }

  function getHeaders() {
    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    };
    const csrf = getCookie("csrftoken") || getCookie("tv_ecuid");
    if (csrf) headers["X-CSRFToken"] = csrf;
    return headers;
  }

  // Fetch all custom watchlists stored on the user's TradingView account
  async function fetchCloudLists() {
    const res = await checkedFetch(`${API_BASE}/custom/`, {
      method: "GET",
      credentials: "include",
      headers: getHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching cloud lists`);
    return await res.json();
  }

  // Replace symbols in the active custom watchlist via TradingView REST API
  async function replaceListViaApi(targetId, symbols, newName) {
    const cleanSymbols = symbols
      .map(s => s.trim())
      .filter(Boolean)
      ;
    if (cleanSymbols.filter(s => !s.startsWith("###")).length > 30) {
      throw new Error("This list exceeds the 30-symbol limit. Edit it before loading; nothing was changed.");
    }

    const replaceRes = await checkedFetch(`${API_BASE}/custom/${targetId}/replace/?unsafe=true`, {
      method: "POST",
      credentials: "include",
      headers: getHeaders(),
      body: JSON.stringify(cleanSymbols)
    });

    if (!replaceRes.ok) {
      throw new Error(`Replace failed with HTTP ${replaceRes.status}`);
    }

    const warnings = [];
    if (newName) {
      try {
        await checkedFetch(`${API_BASE}/custom/${targetId}/rename/`, {
          method: "POST", credentials: "include", headers: getHeaders(),
          body: JSON.stringify({ name: newName })
        });
      } catch (error) { warnings.push(`Symbols replaced, but renaming failed: ${error.message}`); }
    }
    try {
      await checkedFetch(`${API_BASE}/active/${targetId}/`, {
        method: "POST", credentials: "include", headers: getHeaders()
      });
    } catch (error) { warnings.push(`Symbols replaced; activation could not be confirmed: ${error.message}`); }
    return warnings.join(" ");
  }

  // The rename workaround can succeed independently of the activation endpoint.
  async function unlockCloudList(listId, currentName) {
    let renameError;
    try {
      await checkedFetch(`${API_BASE}/custom/${listId}/rename/`, {
        method: "POST", credentials: "include", headers: getHeaders(),
        body: JSON.stringify({ name: currentName })
      });
    } catch (error) { renameError = error; }
    try {
      await checkedFetch(`${API_BASE}/active/${listId}/`, {
        method: "POST", credentials: "include", headers: getHeaders()
      });
      return "";
    } catch (error) {
      if (renameError) throw new Error(`${renameError.message}; ${error.message}`);
      return `Rename workaround applied; activation could not be confirmed. Reload TradingView to check the selected list. ${error.message}`;
    }
  }

  // Fallback: Scrape currently visible tickers from the Watchlist DOM panel
  function scrapeVisibleSymbols() {
    const nodes = document.querySelectorAll(
      '[data-symbol-full], [data-symbol-short], [class*="symbolName"]'
    );
    const symbols = new Set();
    nodes.forEach(el => {
      const full = el.getAttribute("data-symbol-full");
      if (full) symbols.add(full);
    });
    return Array.from(symbols);
  }

  // Fallback: Inject comma-separated string into the "+" Add Symbol search input
  async function pasteViaDomModal(symbols) {
    throw new Error("Safe DOM replacement is unavailable. No symbols were pasted. Retry the API operation after checking your TradingView session.");
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg.action === "GET_CLOUD_LISTS") {
          const lists = await fetchCloudLists();
          sendResponse({ ok: true, lists });
        } else if (msg.action === "APPLY_LOCAL_LIST") {
          let lists;
          try { lists = await fetchCloudLists(); }
          catch (error) { throw new Error(`${error.message}. Safe DOM replacement is unavailable; no changes were made.`); }
          const activeList = lists.find(l => l.active) || lists[0];
          if (activeList && activeList.id) {
            let warning;
            try { warning = await replaceListViaApi(activeList.id, msg.symbols, msg.name); }
            catch (error) { throw new Error(`${error.message}. The operation may be partially applied; refresh TradingView before retrying. Safe DOM replacement is unavailable.`); }
            if (msg.autoReload) setTimeout(() => window.location.reload(), 100);
            sendResponse({ ok: true, mode: "api", warning });
          } else {
            await pasteViaDomModal(msg.symbols);
            sendResponse({ ok: true, mode: "dom" });
          }
        } else if (msg.action === "ACTIVATE_CLOUD_LIST") {
          const warning = await unlockCloudList(msg.id, msg.name);
          if (msg.autoReload) setTimeout(() => window.location.reload(), 100);
          sendResponse({ ok: true, warning });
        } else if (msg.action === "SCRAPE_DOM_SYMBOLS") {
          const symbols = scrapeVisibleSymbols();
          sendResponse({ ok: true, symbols });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  });
})();