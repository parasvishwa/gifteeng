// ─────────────────────────────────────────────────────────────────────────────
// Flipkart scraper — aggressive page scan version.
//
// Flipkart classes are auto-generated and rotate weekly, so we don't rely on
// any class names. Instead we anchor on the rating *pill* shape — a small
// element whose visible text is "X" or "X ★" where X is 1–5 — and walk up
// from there to find the surrounding review block.
//
// IMPORTANT: Flipkart product detail pages show only 4–6 reviews inline.
// For the full set the admin should open the product's "/product-reviews/..."
// page (linked as "All N reviews" near the bottom of the PDP). We work on
// either, but warn in the popup status when we land on a PDP with very few.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  window.__gifteengExtractReviews = function () {
    const reviews = [];
    const seen = new Set();

    // ── Step 1: find every "rating pill" candidate ─────────────────────────
    // The pill is a leaf-ish element whose text is "5", "4", "5 ★" etc.
    function findRatingPills() {
      const all = document.querySelectorAll("div, span");
      const out = [];
      for (const el of all) {
        // Skip elements with too many children — pills are leaves
        if (el.children.length > 2) continue;
        const t = (el.textContent ?? "").trim();
        // Match "5", "4 ★", "5★", "4.5 ★", but reject "5 stars and above"
        if (!/^[1-5](?:\.\d)?\s*★?$/.test(t)) continue;
        // Reject if parent is a rating-summary widget (those are huge)
        const parentText = (el.parentElement?.textContent ?? "").trim();
        if (parentText.length > 5000) continue;
        out.push(el);
      }
      return out;
    }

    // ── Step 2: walk up from a pill to find the surrounding review block ──
    function walkUpToReviewBlock(pill) {
      let cur = pill;
      for (let i = 0; i < 10 && cur; i++) {
        const text = (cur.textContent ?? "").trim();
        // A review block contains the rating PLUS body text — should be
        // 60–3000 chars and contain at least one paragraph or div sibling.
        if (text.length >= 60 && text.length <= 4000) {
          const hasBody = cur.querySelector("p, div") !== null;
          if (hasBody) return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    // ── Step 3: extract review fields from a block ─────────────────────────
    function extractReview(block, pill) {
      const ratingText = (pill.textContent ?? "").trim();
      const m = ratingText.match(/(\d+(?:\.\d+)?)/);
      const rating = m ? parseFloat(m[1]) : null;
      if (!rating || rating < 1 || rating > 5) return null;

      // Collect every text-bearing node, sorted by length desc.
      const allText = [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        const t = (n.textContent ?? "").trim();
        if (!t || t.length < 3) continue;
        // Skip the rating pill text itself
        if (/^[1-5](?:\.\d)?\s*★?$/.test(t)) continue;
        // Skip pure helpfulness counters ("12", "READ MORE")
        if (/^\d+$/.test(t)) continue;
        if (/^(READ MORE|LESS|Permalink|Helpful|Report)$/i.test(t)) continue;
        allText.push(t);
      }
      if (allText.length === 0) return null;

      // The body is the longest text fragment.
      allText.sort((a, b) => b.length - a.length);
      const body = allText[0];
      if (!body || body.length < 5) return null;

      // The title is a short text (5–80 chars) that's not the body, not a
      // location, not "Certified Buyer", not numeric.
      const title = allText.find((t) =>
        t !== body &&
        t.length >= 3 && t.length < 80 &&
        !/Certified Buyer/i.test(t) &&
        !/^\d/.test(t) &&
        !/^[A-Z][a-z]+\s*,\s*[A-Z][a-z]+$/.test(t) // skip "Mumbai, Maharashtra"
      ) ?? null;

      // Author = text near "Certified Buyer" or last short non-body text.
      let author = null;
      const buyerIdx = allText.findIndex((t) => /Certified Buyer/i.test(t));
      if (buyerIdx !== -1) {
        // Author name is usually the entry just before "Certified Buyer"
        const candidate = allText[buyerIdx];
        // Pattern: "Author Name\nCertified Buyer, City"
        const split = candidate.split(/Certified Buyer/i)[0].trim();
        if (split && split.length < 60) author = split;
      }
      if (!author) {
        // Fallback: find a name-shaped short text
        author = allText.find((t) =>
          t !== body && t !== title &&
          t.length >= 3 && t.length < 50 &&
          /^[A-Za-z][A-Za-z\s.]+$/.test(t) &&
          !/Helpful|Read|Permalink|Certified|Months?\s+ago|Years?\s+ago/i.test(t)
        ) ?? null;
      }

      // Photos — img tags inside the block, http(s), not avatars.
      const images = Array.from(block.querySelectorAll("img"))
        .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
        .filter((src) =>
          src &&
          /^https?:\/\//i.test(src) &&
          !/avatar|profile|/64\/64|favicon/i.test(src)
        )
        .slice(0, 6);

      return {
        rating,
        title,
        body,
        author,
        authorAvatar: null,
        date: null, // Flipkart uses relative ("5 months ago") — skip
        images,
        video: null,
        sourceUrl: window.location.href,
      };
    }

    // ── Run extraction ─────────────────────────────────────────────────────
    const pills = findRatingPills();
    const blocks = new Set();
    for (const pill of pills) {
      const block = walkUpToReviewBlock(pill);
      if (!block) continue;
      // Dedupe by block element so two pills in the same block don't
      // produce two reviews.
      if (blocks.has(block)) continue;
      blocks.add(block);

      const review = extractReview(block, pill);
      if (!review) continue;

      const fingerprint = (review.body || "").slice(0, 80);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      reviews.push(review);
    }

    const productTitle =
      document.querySelector("h1.B_NuCI, h1[class*='_35KyD6'], span.B_NuCI")?.textContent?.trim() ??
      document.querySelector("h1")?.textContent?.trim() ?? "";

    return {
      source: "flipkart",
      productTitle,
      productImage: null,
      productUrl: window.location.href,
      reviews,
      // Hint for the popup: if we're on a /p/ PDP and got <5 reviews, the
      // admin should navigate to the dedicated /product-reviews/ page.
      hint:
        reviews.length < 5 && /\/p\/itm/.test(window.location.href)
          ? "Found few reviews on this PDP. Click 'All N reviews' on the page to open Flipkart's full reviews list, then re-run."
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
