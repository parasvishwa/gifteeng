# 🎁 Gifteeng Review Grabber — Chrome Extension

One-click scraping of reviews from Amazon, Flipkart, Myntra & Google → import directly into the Gifteeng review system.

## What it does

1. **Detects** when you're on a supported review page (Amazon, Flipkart, Myntra, Google Maps).
2. Click **Fetch reviews** in the extension popup → it scrapes the visible reviews on that page (no API calls, no scraping services, just reads the DOM you already loaded in your real browser).
3. **Filters** to ratings ≥ 3.5 stars by default (you can change the threshold).
4. Shows each review with a checkbox — uncheck the ones you don't want.
5. Optionally **tag to a Gifteeng product** (searchable dropdown).
6. Click **Import to Gifteeng** → all selected reviews are POSTed to `/api/admin/external-reviews/bulk-import` and approved instantly.

## Installation

1. Visit `chrome://extensions` (or `edge://extensions` on Edge / `brave://extensions` on Brave).
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this `extensions/review-grabber/` folder.
4. Pin the extension (puzzle-piece icon → pin **Gifteeng Review Grabber**).

## First-run setup

When you click the extension for the first time, it'll ask for:

- **Bearer token**: your B2B admin JWT.
  - Open your admin panel (`https://www.gifteeng.com/super-admin`)
  - DevTools → Application → Local Storage → key `gifteeng.b2b.token`
  - Copy the value, paste into the extension.
- **API base** (optional): defaults to `https://new-api.gifteeng.com`. Override only if you're testing locally.

The extension stores this in `chrome.storage.sync` — synced across your Chrome profile, never sent anywhere except the Gifteeng API.

## How to use

### Amazon

1. Navigate to a product page (e.g. `https://www.amazon.in/dp/B0XYZ`).
2. Scroll down to the reviews section so the page renders them.
3. (Optional) Click **See all reviews** for the dedicated paginated review list — more reviews per page.
4. Click the extension → **Fetch reviews** → reviews appear with checkboxes.
5. Tag to product → **Import to Gifteeng**.

### Flipkart

1. Open the product detail or `/product-reviews/...` URL.
2. Same flow.

### Myntra

1. Open the product detail page (reviews are at the bottom) or `/reviews/<id>`.
2. Same flow.

### Google Maps

1. Find a brand listing on Google Maps with reviews.
2. Click "Reviews" tab so they render in the side panel.
3. Same flow.

## Supported sites

- ✅ Amazon (.in / .com)
- ✅ Flipkart (.com)
- ✅ Myntra (.com)
- ✅ Google Maps (and SERP knowledge panels — partial)

To add another site (Meesho, Ajio, Trustpilot…), copy `content-scripts/amazon.js` to `content-scripts/<site>.js`, update the selectors, register it in `manifest.json` under `content_scripts` + `host_permissions`. The popup auto-detects via URL host.

## Scraping reliability

These sites change their HTML class names over time. If reviews come back empty:

1. Open DevTools on the page
2. Right-click on a review block → Inspect
3. Update the selectors in the matching `content-scripts/<site>.js`
4. Reload the extension at `chrome://extensions`

## Privacy

- The extension never sends anything to third-party servers.
- Review data flows: target site DOM → extension popup → your Gifteeng admin API.
- Your token is stored in `chrome.storage.sync` (encrypted at rest by Chrome).

## Icons

The `icons/` folder needs three PNGs at 16×16, 48×48, and 128×128. Drop your Gifteeng logo in there or use the `icon.svg` placeholder + an online converter.
