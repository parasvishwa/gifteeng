// ─────────────────────────────────────────────────────────────────────────────
// Meesho scraper — aggressive page scan version.
//
// Meesho's review markup uses auto-generated class names (e.g. "sc-eDvSVe")
// which churn weekly, so we anchor on stable structural patterns:
//   • A "rating pill" with text matching "X" or "X.Y" star-shaped (1–5)
//   • Walk up to find the review block (60–4000 chars)
//   • Body = longest text node in the block
//
// PDPs typically show 4–5 reviews inline + a "View all comments" / "View all
// reviews" link. The admin should click that for a longer list.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  window.__gifteengExtractReviews = function () {
    const reviews = [];
    const seen = new Set();

    // ── Step 1: find rating "pill" candidates ──────────────────────────────
    function findRatingPills() {
      // Meesho renders a small number near star icons. The pill is a leaf
      // element with text like "5", "4.0", "4★".
      const all = document.querySelectorAll("div, span, h5, h6, p");
      const out = [];
      for (const el of all) {
        if (el.children.length > 2) continue;
        const t = (el.textContent ?? "").trim();
        if (!/^[1-5](?:\.\d)?\s*★?$/.test(t)) continue;
        // Reject summary widgets — those have huge ancestor text
        const top = (el.parentElement?.parentElement?.textContent ?? "").trim();
        if (top.length > 8000) continue;
        out.push(el);
      }

      // Also: anything with aria-label containing "rating"/"stars"
      const ariaPills = Array.from(document.querySelectorAll(
        '[aria-label*="rating" i], [aria-label*="stars" i]'
      ));
      for (const a of ariaPills) {
        const m = (a.getAttribute("aria-label") ?? "").match(/(\d+(?:\.\d+)?)/);
        if (m) out.push(a);
      }
      return out;
    }

    function walkUpToReviewBlock(pill) {
      let cur = pill;
      for (let i = 0; i < 10 && cur; i++) {
        const text = (cur.textContent ?? "").trim();
        if (text.length >= 50 && text.length <= 4000) {
          // Must contain a paragraph or sibling div with body text
          const hasBody = cur.querySelector("p, span, div") !== null;
          if (hasBody) return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    function extractReview(block, pill) {
      // Pull rating from pill text or aria-label
      let rating = null;
      const aria = pill.getAttribute?.("aria-label");
      if (aria) {
        const m = aria.match(/(\d+(?:\.\d+)?)/);
        if (m) rating = parseFloat(m[1]);
      }
      if (!rating) {
        const m = (pill.textContent ?? "").trim().match(/(\d+(?:\.\d+)?)/);
        if (m) rating = parseFloat(m[1]);
      }
      if (!rating || rating < 1 || rating > 5) return null;

      // Collect all text-bearing nodes
      const allText = [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        const t = (n.textContent ?? "").trim();
        if (!t || t.length < 3) continue;
        if (/^[1-5](?:\.\d)?\s*★?$/.test(t)) continue;
        if (/^\d+$/.test(t)) continue;
        if (/^(Helpful|Report|Read more|View more|Less|MORE)$/i.test(t)) continue;
        if (/^₹/.test(t)) continue; // skip prices
        allText.push(t);
      }
      if (allText.length === 0) return null;

      allText.sort((a, b) => b.length - a.length);
      const body = allText[0];
      if (!body || body.length < 5) return null;

      // Author — short name-shaped text near top
      let author = null;
      const candidate = allText.find((t) =>
        t !== body &&
        t.length >= 2 && t.length <= 50 &&
        /^[A-Za-z][A-Za-z\s.]+$/.test(t) &&
        !/^(Helpful|Report|Read|Less|More|Verified|Buyer)$/i.test(t)
      );
      if (candidate) author = candidate;

      // Photos — imgs inside the block, http(s), not avatars/icons
      const images = Array.from(block.querySelectorAll("img"))
        .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
        .filter((src) =>
          src &&
          /^https?:\/\//i.test(src) &&
          !/avatar|profile|user_image|favicon|/64x64/i.test(src) &&
          !src.includes("data:image")
        )
        .slice(0, 6);

      return {
        rating,
        title: null,
        body,
        author,
        authorAvatar: null,
        date: null,
        images,
        video: null,
        sourceUrl: window.location.href,
      };
    }

    const pills = findRatingPills();
    const blocks = new Set();
    for (const pill of pills) {
      const block = walkUpToReviewBlock(pill);
      if (!block) continue;
      if (blocks.has(block)) continue;
      blocks.add(block);

      const review = extractReview(block, pill);
      if (!review) continue;

      const fingerprint = (review.body || "").slice(0, 60);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      reviews.push(review);
    }

    const productTitle =
      document.querySelector("h1")?.textContent?.trim() ??
      document.querySelector('[class*="ProductTitle" i]')?.textContent?.trim() ?? "";

    return {
      source: "meesho",
      productTitle,
      productImage: null,
      productUrl: window.location.href,
      reviews,
      hint:
        reviews.length < 3
          ? "Found few reviews. Scroll to the reviews section, click 'View all' if available, then re-run."
          : null,
    };
  };

  if (!document.getElementById("gifteeng-grabber-tag")) {
    const tag = document.createElement("div");
    tag.id = "gifteeng-grabber-tag";
    tag.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:99999;" +
      "background:#EF3752;color:white;padding:5px 10px;border-radius:14px;" +
      "font:600 11px -apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.25);" +
      "pointer-events:none;opacity:0.85;";
    tag.textContent = "🎁 Gifteeng grabber ready";
    document.body.appendChild(tag);
    setTimeout(() => tag.style.opacity = "0", 3000);
    setTimeout(() => tag.remove(), 4000);
  }
})();
