// ─────────────────────────────────────────────────────────────────────────────
// Gifteeng Review Grabber — popup logic
//
// Flow:
//   1. On open → check chrome.storage for token + apiBase. If absent → auth.
//   2. Detect source (Amazon/Flipkart/Myntra/Google) from active tab URL.
//   3. User clicks "Fetch reviews" → executes the matching content script's
//      extractReviews() in the active tab via chrome.scripting.executeScript.
//   4. Filter to >= minRating; render with checkboxes (default checked).
//   5. User picks product to tag (search Gifteeng products via API).
//   6. Click "Import" → POST /api/admin/external-reviews/bulk-import.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_API = "https://new-api.gifteeng.com";
const $ = (id) => document.getElementById(id);

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  token:      "",
  apiBase:    DEFAULT_API,
  sourceKind: null,    // "amazon" | "flipkart" | "myntra" | "google" | null
  reviews:    [],      // last fetched
  filtered:   [],      // filtered by minRating
  productId:  null,    // selected Gifteeng product id (or null)
};

// ── Storage helpers ──────────────────────────────────────────────────────────
async function loadAuth() {
  const data = await chrome.storage.sync.get(["token", "apiBase"]);
  state.token   = data.token   || "";
  state.apiBase = data.apiBase || DEFAULT_API;
}

async function saveAuth(token, apiBase) {
  await chrome.storage.sync.set({ token, apiBase: apiBase || DEFAULT_API });
  state.token   = token;
  state.apiBase = apiBase || DEFAULT_API;
}

// ── Source detection from URL ────────────────────────────────────────────────
function detectSource(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("amazon.in")    || u.includes("amazon.com")) return "amazon";
  if (u.includes("flipkart.com")) return "flipkart";
  if (u.includes("myntra.com"))   return "myntra";
  if (u.includes("meesho.com"))   return "meesho";
  if (u.includes("google.com"))   return "google";
  return null;
}

const SOURCE_META = {
  amazon:   { label: "Amazon",   emoji: "📦" },
  flipkart: { label: "Flipkart", emoji: "🛒" },
  myntra:   { label: "Myntra",   emoji: "👗" },
  meesho:   { label: "Meesho",   emoji: "🛍" },
  google:   { label: "Google",   emoji: "G"  },
};

// ── Render auth or main screen on load ───────────────────────────────────────
async function init() {
  await loadAuth();
  if (!state.token) {
    $("authScreen").classList.remove("hidden");
    $("mainScreen").classList.add("hidden");
  } else {
    showMain();
  }
  bindEvents();
}

async function showMain() {
  $("authScreen").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
  // Detect source from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const src = detectSource(tab?.url);
  state.sourceKind = src;
  $("sourceUrl").textContent = tab?.url || "—";
  if (src) {
    const m = SOURCE_META[src];
    $("sourceIcon").textContent = m.emoji;
    $("sourceIcon").className = "source-icon " + src;
    $("sourceLabel").textContent = m.label + " — ready to fetch";
    $("fetchBtn").disabled = false;
  } else {
    $("sourceIcon").textContent = "?";
    $("sourceIcon").className = "source-icon unsupported";
    $("sourceLabel").textContent = "Unsupported page";
    $("fetchStatus").classList.remove("hidden");
    $("fetchStatus").textContent = "Open this extension on an Amazon, Flipkart, Myntra or Google reviews page.";
    $("fetchBtn").disabled = true;
  }
}

// ── Event bindings ───────────────────────────────────────────────────────────
function bindEvents() {
  $("saveAuthBtn").addEventListener("click", async () => {
    const t = $("tokenInput").value.trim();
    const b = $("apiBaseInput").value.trim();
    if (!t) {
      $("authError").textContent = "Token is required";
      $("authError").classList.remove("hidden");
      return;
    }
    await saveAuth(t, b);
    showMain();
  });

  // Auto-detect token from any open admin tab. We hunt for tabs on
  // gifteeng.com / business.gifteeng.com / *.localhost with the b2b token
  // in localStorage and pull it out via chrome.scripting.executeScript.
  $("autoDetectBtn").addEventListener("click", async () => {
    $("authError").classList.add("hidden");
    $("autoDetectBtn").textContent = "🔍 Searching open tabs…";
    $("autoDetectBtn").disabled = true;

    try {
      const candidates = await chrome.tabs.query({
        url: [
          "https://*.gifteeng.com/*",
          "https://gifteeng.com/*",
          "http://*.gifteeng.localhost/*",
          "http://localhost/*",
        ],
      });

      if (candidates.length === 0) {
        $("authError").textContent =
          "No Gifteeng admin tab is open. Please open your admin panel first, log in, then click this again.";
        $("authError").classList.remove("hidden");
        return;
      }

      let found = null;
      let apiBaseGuess = DEFAULT_API;
      for (const tab of candidates) {
        try {
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              try {
                return {
                  token:   localStorage.getItem("gifteeng.b2b.token"),
                  origin:  window.location.origin,
                };
              } catch { return null; }
            },
          });
          const data = result?.[0]?.result;
          if (data?.token) {
            found = data.token;
            // If admin is on .com, the API is new-api.gifteeng.com. If on
            // localhost, infer http://localhost:4000.
            if (data.origin?.includes("localhost")) {
              apiBaseGuess = "http://localhost:4000";
            } else {
              apiBaseGuess = "https://new-api.gifteeng.com";
            }
            break;
          }
        } catch { /* tab may be inaccessible — try next */ }
      }

      if (!found) {
        $("authError").textContent =
          "Found admin tabs but no token. Please log in to the admin panel first.";
        $("authError").classList.remove("hidden");
        return;
      }

      await saveAuth(found, apiBaseGuess);
      showMain();
    } catch (e) {
      $("authError").textContent = "Auto-detect failed: " + (e?.message || e);
      $("authError").classList.remove("hidden");
    } finally {
      $("autoDetectBtn").textContent = "🔍 Find token from open admin tab";
      $("autoDetectBtn").disabled = false;
    }
  });

  $("settingsBtn").addEventListener("click", () => {
    $("authScreen").classList.remove("hidden");
    $("mainScreen").classList.add("hidden");
    $("tokenInput").value   = state.token;
    $("apiBaseInput").value = state.apiBase;
  });

  $("fetchBtn").addEventListener("click", fetchReviews);

  $("minRatingFilter").addEventListener("change", () => {
    if (state.reviews.length) renderReviews();
  });

  $("productSearch").addEventListener("input", debounce(searchProducts, 300));

  $("clearProduct").addEventListener("click", () => {
    state.productId = null;
    $("selectedProduct").classList.add("hidden");
    $("productSearch").value = "";
    $("productSearch").classList.remove("hidden");
  });

  $("selectAllBtn").addEventListener("click", () => toggleAll(true));
  $("selectNoneBtn").addEventListener("click", () => toggleAll(false));

  // Bind import via direct property + addEventListener — belt and braces.
  // If anything ever throws inside importReviews before showStatus runs,
  // the catch here also surfaces it visibly.
  const importBtn = $("importBtn");
  const safeImport = async (ev) => {
    console.log("[gifteeng-grabber] import button clicked");
    try {
      await importReviews();
    } catch (e) {
      console.error("[gifteeng-grabber] uncaught", e);
      showStatus(`❌ Click handler error: ${e?.message || e}`, false);
    }
  };
  importBtn.onclick = safeImport;
}

// ── Fetch reviews from active tab via content script ─────────────────────────
async function fetchReviews() {
  $("fetchStatus").classList.remove("hidden");
  $("fetchStatus").style.whiteSpace = "pre-line";
  $("fetchStatus").textContent = "⏳ Scraping reviews from current page…";
  $("reviewList").innerHTML = "";
  $("actionBar").classList.add("hidden");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    $("fetchStatus").textContent = "Could not access the current tab.";
    return;
  }

  try {
    // Step 1: pre-warm the page. On Amazon, review images are lazy-loaded —
    // scroll the reviews section into view and wait ~1.5s so all <img> tags
    // get their real src attribute set before we read the DOM. This single
    // change is the difference between "no images" and "images present".
    if (state.sourceKind === "amazon") {
      $("fetchStatus").textContent = "⏳ Loading review media…";
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Scroll to the customer reviews section
          const el =
            document.getElementById("cm_cr-review_list") ||
            document.getElementById("reviewsMedley") ||
            document.querySelector('[data-hook="reviews-medley-footer"]') ||
            document.querySelector('#reviews-medley-footer') ||
            document.querySelector('[data-hook="review"]')?.parentElement;
          if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
          // Trigger any lazy-load observers by scrolling through reviews
          const reviews = document.querySelectorAll('[data-hook="review"]');
          reviews.forEach((r, i) => {
            setTimeout(() => r.scrollIntoView({ behavior: "instant", block: "center" }), i * 80);
          });
        },
      });
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Step 2: run extraction
    $("fetchStatus").textContent = "⏳ Scraping reviews…";
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof window.__gifteengExtractReviews === "function") {
          return window.__gifteengExtractReviews();
        }
        return { error: "scraper-not-loaded" };
      },
    });
    const data = result?.[0]?.result;
    if (data?.error === "scraper-not-loaded") {
      $("fetchStatus").textContent = "❌ Scraper not loaded. Refresh the page and try again.";
      return;
    }
    if (!data || !Array.isArray(data.reviews)) {
      $("fetchStatus").textContent = "❌ No reviews found. Make sure you're on a reviews page.";
      return;
    }
    state.reviews = data.reviews;

    // Surface media counts so the admin knows whether scraping captured
    // images/videos before they ever click Import.
    const imageCount = data.reviews.reduce((n, r) => n + (r.images?.length || 0), 0);
    const videoCount = data.reviews.reduce((n, r) => n + (r.video ? 1 : 0), 0);

    let msg = `✓ Found ${data.reviews.length} reviews · ${imageCount} image(s) · ${videoCount} video(s).`;
    if (data.hint) msg += `\n💡 ${data.hint}`;
    if (state.sourceKind === "amazon" && imageCount === 0 && videoCount === 0 && data.reviews.length > 0) {
      msg += `\n💡 No media detected. Open the dedicated /product-reviews/<ASIN>/ page (link "See all reviews" near the bottom) — Amazon shows photos & videos there.`;
    }
    $("fetchStatus").textContent = msg;
    $("productTag").classList.remove("hidden");
    renderReviews();
  } catch (e) {
    $("fetchStatus").textContent = `❌ ${e?.message || e}`;
  }
}

// ── Render reviews list with checkboxes ──────────────────────────────────────
function renderReviews() {
  const min = parseFloat($("minRatingFilter").value) || 3.5;
  state.filtered = state.reviews.filter((r) => (r.rating ?? 0) >= min);

  if (state.filtered.length === 0) {
    $("reviewList").innerHTML = `<li class="muted" style="padding:12px;text-align:center;">No reviews ≥ ${min} stars on this page.</li>`;
    $("actionBar").classList.add("hidden");
    return;
  }

  $("reviewList").innerHTML = state.filtered.map((r, i) => {
    const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
    const imgHtml = (r.images || []).slice(0, 4).map((src) =>
      `<img src="${escapeHtml(src)}" alt="" />`).join("");
    const vidHtml = r.video ? `<video src="${escapeHtml(r.video)}" muted></video>` : "";
    const extraImgs = (r.images || []).length > 4
      ? `<span class="media-count">+${(r.images || []).length - 4} more</span>` : "";
    const dateStr = r.date ? new Date(r.date).toLocaleDateString() : "";
    return `
      <li class="review-item checked" data-idx="${i}">
        <input type="checkbox" checked />
        <div class="review-content">
          <div class="review-meta">
            <span class="stars">${stars}</span>
            <span class="author">${escapeHtml(r.author || "Anonymous")}</span>
            ${dateStr ? `<span>· ${dateStr}</span>` : ""}
          </div>
          ${r.title ? `<p class="review-title">${escapeHtml(r.title)}</p>` : ""}
          <p class="review-body">${escapeHtml(r.body || "")}</p>
          ${imgHtml || vidHtml ? `<div class="review-media">${imgHtml}${vidHtml}</div>${extraImgs}` : ""}
        </div>
      </li>
    `;
  }).join("");

  // Bind row toggles
  document.querySelectorAll(".review-item").forEach((li) => {
    const cb = li.querySelector("input[type=checkbox]");
    cb.addEventListener("change", () => {
      li.classList.toggle("checked", cb.checked);
      updateImportButton();
    });
  });

  $("actionBar").classList.remove("hidden");
  updateImportButton();
}

function toggleAll(state) {
  document.querySelectorAll(".review-item input[type=checkbox]").forEach((cb) => {
    cb.checked = state;
    cb.closest(".review-item").classList.toggle("checked", state);
  });
  updateImportButton();
}

function updateImportButton() {
  const checked = document.querySelectorAll(".review-item input[type=checkbox]:checked").length;
  $("selectedCount").textContent = checked;
  $("importBtn").disabled = checked === 0;
}

// ── Product search (uses Gifteeng API) ───────────────────────────────────────
async function searchProducts() {
  const q = $("productSearch").value.trim();
  if (!q) {
    $("productResults").classList.add("hidden");
    return;
  }
  try {
    const res = await fetch(`${state.apiBase}/api/products?search=${encodeURIComponent(q)}&pageSize=10`);
    const data = await res.json();
    const items = data.items || data || [];
    if (!items.length) {
      $("productResults").innerHTML = `<div class="dropdown-item muted">No products match "${escapeHtml(q)}"</div>`;
    } else {
      $("productResults").innerHTML = items.map((p) =>
        `<div class="dropdown-item" data-id="${p.id}" data-title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</div>`
      ).join("");
      $("productResults").querySelectorAll(".dropdown-item").forEach((el) => {
        el.addEventListener("click", () => {
          state.productId = el.dataset.id;
          $("selectedProductTitle").textContent = el.dataset.title;
          $("selectedProduct").classList.remove("hidden");
          $("productResults").classList.add("hidden");
          $("productSearch").classList.add("hidden");
        });
      });
    }
    $("productResults").classList.remove("hidden");
  } catch {
    $("productResults").innerHTML = `<div class="dropdown-item muted">Could not search products</div>`;
    $("productResults").classList.remove("hidden");
  }
}

// ── Import — POST selected reviews to Gifteeng ──────────────────────────────
async function importReviews() {
  // Show "starting" state IMMEDIATELY so the user sees something happen,
  // even if a synchronous error follows. Anything thrown below shows up
  // in the visible status bar, never silently.
  showStatus("⏳ Preparing import…", true);
  $("importBtn").disabled = true;
  $("importBtn").textContent = "Importing…";

  try {
    if (!state.token) {
      throw new Error("No admin token saved. Open settings (⚙) and sign in.");
    }
    if (!state.apiBase) {
      throw new Error("No API base saved. Open settings (⚙) and configure.");
    }

    // Collect selected
    const selectedReviews = [];
    document.querySelectorAll(".review-item").forEach((li) => {
      const cb = li.querySelector("input[type=checkbox]");
      if (!cb || !cb.checked) return;
      const idx = parseInt(li.dataset.idx, 10);
      const r = state.filtered[idx];
      if (!r) return;
      selectedReviews.push({
        rating:       Math.max(1, Math.min(5, Math.round(r.rating))),
        title:        r.title  || null,
        body:         r.body   || "",
        author:       r.author || null,
        authorAvatar: r.authorAvatar || null,
        reviewDate:   r.date   || null,
        sourceUrl:    r.sourceUrl || null,
        photoUrls:    Array.isArray(r.images) ? r.images.filter((u) => /^https?:\/\//i.test(u)).slice(0, 8) : [],
        videoUrl:     (typeof r.video === "string" && /^https?:\/\//i.test(r.video)) ? r.video : null,
        isApproved:   true,
      });
    });

    if (selectedReviews.length === 0) {
      throw new Error("No reviews selected. Tick at least one checkbox.");
    }

    const url = `${state.apiBase}/api/admin/external-reviews/bulk-import`;
    showStatus(`⏳ Posting ${selectedReviews.length} review(s) to ${state.apiBase}…`, true);
    console.log("[gifteeng-grabber] POST", url, {
      source: state.sourceKind, productId: state.productId, count: selectedReviews.length,
    });

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${state.token}`,
        },
        body: JSON.stringify({
          source:    state.sourceKind || "manual",
          productId: state.productId,
          reviews:   selectedReviews,
        }),
      });
    } catch (netErr) {
      // CORS / DNS / offline — fetch rejects *before* getting a response.
      console.error("[gifteeng-grabber] network error", netErr);
      throw new Error(
        `Network error: ${netErr?.message || netErr}. ` +
        `Check that ${state.apiBase} is reachable and listed in the extension's host_permissions.`
      );
    }

    let data = null;
    try { data = await res.json(); } catch { /* response may be empty / non-JSON */ }
    console.log("[gifteeng-grabber] response", res.status, data);

    if (!res.ok) {
      const msg = data?.message
        ? (Array.isArray(data.message) ? data.message.join(", ") : data.message)
        : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const imp = data?.imported ?? 0;
    const skipped = data?.skipped ?? 0;
    showStatus(`✓ Imported ${imp} review(s)${skipped ? ` (${skipped} skipped)` : ""}.`, true);
    state.reviews = [];
    state.filtered = [];
    $("reviewList").innerHTML = "";
    $("actionBar").classList.add("hidden");
    $("productTag").classList.add("hidden");
  } catch (e) {
    console.error("[gifteeng-grabber] import failed", e);
    showStatus(`❌ Import failed: ${e?.message || e}`, false);
  } finally {
    $("importBtn").disabled = false;
    $("importBtn").textContent = "↑ Import to Gifteeng";
  }
}

function showStatus(message, success) {
  const el = $("importStatus");
  el.textContent = message;
  el.className = "status " + (success ? "success" : "error");
  el.style.whiteSpace = "pre-line";
  el.style.wordBreak  = "break-word";
  el.classList.remove("hidden");
}

// ── Tiny utils ───────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); };
}

// Boot
init();
