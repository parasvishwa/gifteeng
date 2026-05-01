// ─────────────────────────────────────────────────────────────────────────────
// Google scraper — currently targets Google Maps reviews (/maps/place/...).
//
// For SERP "knowledge panel" reviews and Google Shopping reviews, additional
// selectors can be added below — both share similar markup.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  window.__gifteengExtractReviews = function () {
    const reviews = [];

    // Google Maps reviews — each in a div[data-review-id]
    const cards = document.querySelectorAll('div[data-review-id], div[jsaction*="reviewerLink"]');

    cards.forEach((card) => {
      try {
        // Rating is in aria-label of the star widget, e.g. "5 stars"
        const starWidget = card.querySelector('span[role="img"][aria-label*="star"], span[aria-label*="stars"]');
        const ariaLabel = starWidget?.getAttribute("aria-label") ?? "";
        const ratingMatch = ariaLabel.match(/(\d+(?:\.\d+)?)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
        if (!rating || rating < 1 || rating > 5) return;

        // Body — typically in a span with jsname or under a class with "wiI7pd"
        const bodyEl = card.querySelector('span.wiI7pd, div[data-expandable-section] span');
        const body = bodyEl?.textContent?.trim() ?? "";
        if (!body || body.length < 5) return;

        // Author
        const author = card.querySelector('div.d4r55, button[jsaction*="reviewerLink"]')?.textContent?.trim() ?? null;
        // Avatar
        const authorAvatar = card.querySelector("button img, a img")?.src ?? null;

        // Date — "2 weeks ago", "3 months ago" → keep null (relative)
        const date = null;

        // Images
        const images = Array.from(card.querySelectorAll('button[jsaction*="image"] img, div[role="img"] img'))
          .map((img) => img.src)
          .filter(Boolean)
          .slice(0, 6);

        reviews.push({
          rating,
          title: null,
          body,
          author,
          authorAvatar,
          date,
          images,
          video: null,
          sourceUrl: window.location.href,
        });
      } catch {}
    });

    return {
      source: "google",
      productTitle: document.querySelector("h1")?.textContent?.trim() ?? "",
      productImage: null,
      productUrl: window.location.href,
      reviews,
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
