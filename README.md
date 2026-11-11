# TradingView Watchlist Switcher

TradingView Watchlist Switcher is a lightweight Manifest V3 Chrome extension that attempts to work with the single-watchlist restriction on TradingView's free Basic plan. It lets you to store unlimited custom watchlists locally and swap them into your active Basic watchlist slot, or switch directly between older locked cloud watchlists on your account.

## Current status

Local Load and cloud Switch have been reported as not working. Live Chrome verification is pending. TradingView uses undocumented endpoints that may reject these operations; switching and unlocking are not guaranteed. The DOM replacement fallback is disabled because it could append symbols rather than safely replace a list.

## Features

* **Unlimited Local Lists:** Store any number of custom 30-symbol watchlists in `chrome.storage.local` and swap them into your active slot in one click.
* **Section Divider Support:** Preserve TradingView `###Section` headers when capturing, editing, and loading watchlists.
* **Locked Cloud Access:** Inspect all previously created watchlists on your TradingView account, back them up locally, or unlock and activate them directly.
* **Session API:** Attempts updates through TradingView's internal session API and reports request failures or partial completion.
* **Portable Backups:** Export and import your watchlist collection as structured JSON archives or standard comma-separated TXT files.

## How It Works

1. **Slot Swapping:** When you load a local list, the extension queries `GET /api/v1/symbols_list/custom/` to identify your active Basic watchlist ID and replaces its symbols via `POST /api/v1/symbols_list/custom/{id}/replace/?unsafe=true`.
2. **Cloud List Unlocking:** When TradingView locks older cloud watchlists behind an upgrade prompt, the extension sends a no-op rename payload to `POST /api/v1/symbols_list/custom/{id}/rename/` followed by `POST /api/v1/symbols_list/active/{id}/`, attempting to set that list as active. A successful rename does not confirm activation.
3. **Failure handling:** API failures are reported in the popup. No DOM paste is attempted.

## Project Structure

```text
tv-watchlist-switcher/
├── manifest.json   # Manifest V3 configuration and permissions
├── content.js      # Session API client injected into TradingView
├── popup.html      # Dark-themed extension popup UI matching TradingView styling
└── popup.js        # Local storage state management, cloud sync, and file I/O
```

## Installation

1. Clone this repository or download the source files into a local folder named **tv-watchlist-switcher**:
   ```bash
   git clone https://github.com/vblosh/tv-watchlist-switcher.git
   ```
2. Open Google Chrome and navigate to **chrome://extensions/** in the address bar.
3. Enable the **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner and select the **tv-watchlist-switcher** directory.
5. Pin **TV Watchlist Switcher** to your Chrome toolbar for quick access.

## Usage

### Managing Local Watchlists

* **Capture Current:** Open any TradingView chart tab and click **+ Capture Current** to snapshot your currently active cloud watchlist (including `###Section` dividers) into local storage.
* **Save Local List:** Enter a list name and up to 30 symbols separated by commas or newlines using `EXCHANGE:TICKER` notation, then click **Save Local List**.
* **Load:** Click **Load** next to any saved local list to overwrite your active Basic watchlist slot and refresh the chart tab.
* **Edit:** Click **Edit** to populate an existing list's tickers into the editor for modification.

### Unlocking Cloud Watchlists

* **Refresh:** Click **Refresh** under the Account Cloud Lists section while on an open TradingView tab to list all custom watchlists stored on your account.
* **Switch:** Click **Switch** next to any locked cloud watchlist to attempt activation on your chart.
* **Save Local:** Click **Save Local** to clone a locked cloud watchlist into your local browser storage before modifying or clearing it.

### Backup and Restore

* **Export JSON:** Downloads all saved local watchlists into a dated JSON backup file.
* **Import JSON:** Imports either a previously exported JSON collection or a standard TradingView TXT file containing comma-separated symbols.

## Data Formats

### Comma-Separated Input and TXT Format

```text
###Semiconductors,NASDAQ:NVDA,NASDAQ:AMD,NASDAQ:AVGO,###Crypto,BINANCE:BTCUSDT,BINANCE:ETHUSDT
```

### JSON Backup Schema

```json
[
  {
    "name": "Semis & AI",
    "symbols": [
      "###Semiconductors",
      "NASDAQ:NVDA",
      "NASDAQ:AMD",
      "###Cloud",
      "NYSE:MSFT"
    ]
  }
]
```

## Permissions

* **storage:** Saves your custom watchlists and UI preferences locally in `chrome.storage.local`.
* **activeTab:** Communicates with the currently focused TradingView tab when you open the popup.
* **scripting:** Declared in the manifest; the current implementation uses a manifest-registered content script rather than dynamic injection.

## Disclaimer

This project is an unofficial utility and is not affiliated with, endorsed by, or maintained by TradingView. Use at your own discretion in accordance with TradingView's policies.

## Validation

JavaScript syntax checks and isolated mocked API regression checks have passed. These checks do not validate TradingView endpoint contracts or live switching.

After changing extension files, reload the extension in `chrome://extensions/` and refresh the TradingView tab. Export cloud lists before replacing their contents: loading a local list overwrites the selected cloud slot.