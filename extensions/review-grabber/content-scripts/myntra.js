// ─────────────────────────────────────────────────────────────────────────────
// Myntra scraper.
//
// Works on:
//   • Product detail page (reviews inline near the bottom)
//   • Dedicated reviews page (/reviews/<style-id>)
//
// Myntra's class names (e.g. `.user-review-main`) are more stable than
// Flipkart's, but still drift. We try named selectors first, then fall back
// to structural patterns (rating-shaped numbers + body-shaped text blocks).
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  window.__gifteengExtractReviews = function () {
    const reviews = [];
    const seen = new Set();

    function findCards() {
      // Strategy 1: known stable Myntra classes
      let cards = Array.from(document.querySelectorAll(
        ".user-review-main, .user-review-userReviewWrapper, " +
        "[class*='userReviewMain'], [class*='reviewWrapper'], " +
        ".index-userReviewMain"
      ));
      if (cards.length > 0) return cards;

      // Strategy 2: any element with a 1-5 numeric rating + text
      return Array.from(document.querySelectorAll("div, article")).filter((el) => {
        const t = el.textContent ?? "";
        const rating = el.querySelector('[class*="starRating" i], [class*="userRatingNumber" i]');
        return (
          rating &&
          t.length > 50 && t.length < 3000
        );
      });
    }

    findCards().forEach((card) => {
      try {
        // Rating — try named selectors, then count filled stars
        const ratingNode = card.querySelector(
          ".user-review-starRating, .user-review-userRatingNumber, " +
          "[class*='starRating' i], [class*='ratingNumber' i]"
        );
        let rating = null;
        if (ratingNode) {
          const m = (ratingNode.textContent ?? "").match(/(\d+(?:\.\d+)?)/);
          if (m) rating = parseFloat(m[1]);
        }
        if (!rating) {
          // Fallback: count filled SVG stars
          const filled = card.querySelectorAll(
            ".filled, .index-starWrapper .filled, [class*='filledStar' i]"
          ).length;
          if (filled >= 1 && filled <= 5) rating = filled;
        }
        if (!rating || rating < 1 || rating > 5) return;

        // Body — first try named class, fall back to longest p/div text
        let body = card.querySelector(
          ".user-review-reviewTextWrapper, .user-review-reviewWrapper p, " +
          "[class*='reviewText' i], [class*='reviewBody' i]"
        )?.textContent?.trim() ?? "";

        if (!body) {
          const candidates = Array.from(card.querySelectorAll("p, span, div"))
            .map((n) => {
              const text = Array.from(n.childNodes)
                .filter((c) => c.nodeType === 3)
                .map((c) => c.textContent ?? "")
                .join("")
                .trim();
              return text;
            })
            .filter((t) => t && t.length >= 15 && t.length < 3000)
            .filter((t) => !/^\d+(\.\d+)?$/.test(t)); // skip numeric-only
          candidates.sort((a, b) => b.length - a.length);
          body = candidates[0] ?? "";
        }
        if (!body || body.length < 5) return;

        // Author
        const author = card.querySelector(
          ".user-review-left .user-review-name, .user-review-userInfoWrapper, " +
          "[class*='reviewerName' i], [class*='userName' i]"
        )?.textContent?.trim() ?? null;

        // Photos
        const images = Array.from(card.querySelectorAll(
          ".user-review-images img, .image-grid-image, " +
          "img[class*='reviewImage' i]"
        ))
          .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
          .filter((src) => src && /^https?:\/\//i.test(src))
          .slice(0, 6);

        const fingerprint = body.slice(0, 80);
        if (seen.has(fingerprint)) return;
        seen.add(fingerprint);

        reviews.push({
          rating,
          title: null,
          body,
          author,
          authorAvatar: null,
          date: null,
          images,
          video: null,
          sourceUrl: window.location.href,
        });
      } catch { /* skip on parse error */ }
    });

    const productTitle =
      document.querySelector("h1.pdp-name, h1.pdp-title, h1[class*='pdpName' i]")?.textContent?.trim() ??
      document.querySelector("h1")?.textContent?.trim() ?? "";

    return {
      source: "myntra",
      productTitle,
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
