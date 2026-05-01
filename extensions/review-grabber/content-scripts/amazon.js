// ─────────────────────────────────────────────────────────────────────────────
// Amazon scraper — extracts reviews from the visible page.
//
// Works on:
//   • Product pages (/dp/B0..., /gp/product/B0...) — top reviews are visible
//   • Dedicated review pages (/product-reviews/B0...) — full list, paginated
//
// Scraping strategy: pure DOM read, no network calls. Selectors target
// Amazon's `data-hook=review` containers which have been stable for years.
// Images are direct CDN URLs; videos are <video> with src attribute.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // Expose extractor on window so the popup can invoke via executeScript.
  window.__gifteengExtractReviews = function () {
    const reviews = [];
    const containers = document.querySelectorAll('[data-hook="review"]');

    containers.forEach((el) => {
      try {
        // Rating — Amazon stores as "4.0 out of 5 stars" in the alt text
        const ratingText = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt')?.textContent ?? "";
        const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
        if (!rating) return;

        // Title — different selectors for top reviews vs cmps reviews
        let title = el.querySelector('[data-hook="review-title"] span:not(.cr-original-review-content)')?.textContent?.trim()
                  ?? el.querySelector('[data-hook="review-title"]')?.textContent?.trim()
                  ?? "";
        // Title often has the rating prefix on top reviews — strip it
        title = title.replace(/^\d+(?:\.\d+)?\s+out\s+of\s+5\s+stars\s*/i, "").trim();

        // Body
        const body = el.querySelector('[data-hook="review-body"] span:not([class*="cr-translated"])')?.textContent?.trim()
                  ?? el.querySelector('[data-hook="review-body"]')?.textContent?.trim()
                  ?? "";
        if (!body || body.length < 5) return; // skip empty

        // Author
        const author = el.querySelector(".a-profile-name")?.textContent?.trim() ?? null;

        // Date — "Reviewed in India on 12 March 2025"
        const dateText = el.querySelector('[data-hook="review-date"]')?.textContent?.trim() ?? "";
        const dateMatch = dateText.match(/on\s+(.+)$/);
        const date = dateMatch ? new Date(dateMatch[1]).toISOString() : null;

        // Images — Amazon's lazy-loaded review images use many variants.
        // Strategy: take only <img> tags that are NOT inside the reviewer's
        // profile widget (which contains their avatar). The profile widget
        // is `.a-profile`, `.a-profile-avatar`, `.cr-lighthouse-reviewer`,
        // or anything with `data-hook="genome-widget"`.
        const allImgs = Array.from(el.querySelectorAll("img")).filter((img) => {
          // Skip if inside a profile/avatar container
          if (img.closest(".a-profile, .a-profile-avatar, .cr-lighthouse-reviewer, [data-hook='genome-widget'], [data-hook='reviewer-name']")) {
            return false;
          }
          return true;
        });
        const images = allImgs
          .map((img) => {
            const src =
              img.getAttribute("src") ||
              img.getAttribute("data-src") ||
              img.getAttribute("data-a-hires") ||
              img.getAttribute("data-old-hires") ||
              "";
            return src;
          })
          .filter((src) =>
            src &&
            /^https?:\/\//i.test(src) &&
            /(media-amazon|images-amazon|ssl-images-amazon)/i.test(src) &&
            // skip clearly-non-review imagery
            !/sprite|grey-pixel|transparent-pixel|loading|spinner|avatars?[-_/]?global|amazon-avatars|\/avatars?\/|\/profile\/|profile[-_]?pic|default[-_]?avatar/i.test(src) &&
            !/default\.(png|jpg|jpeg|gif)$/i.test(src) &&    // anonymous default avatars
            !/_SY40_|_SX40_|_CR0,0,40/i.test(src)            // tiny thumbnails
          )
          .map((src) => src.replace(/\._[A-Z0-9_,]+_?\./, ".")) // upgrade thumb
          .filter((src, i, arr) => arr.indexOf(src) === i); // dedupe

        // Also try background-image on lightbox thumbnails (some templates
        // render review photos as <div style="background-image:url(...)">).
        const bgImages = Array.from(
          el.querySelectorAll('[style*="background-image"]')
        )
          .map((node) => {
            const style = node.getAttribute("style") || "";
            const m = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
            return m ? m[1] : "";
          })
          .filter((src) =>
            src &&
            /^https?:\/\//i.test(src) &&
            /(media-amazon|images-amazon|ssl-images-amazon)/i.test(src)
          )
          .map((src) => src.replace(/\._[A-Z0-9_,]+_?\./, "."));
        for (const src of bgImages) {
          if (!images.includes(src)) images.push(src);
        }

        // Videos — Amazon renders review videos in several ways:
        //   1. <video src="..."> direct (older pages)
        //   2. <video data-src="...">
        //   3. <input type="hidden" name="videoUrl" value="...">
        //   4. <a> / <button> with data-video-url
        //   5. JSON blob inside the review markup with .videoUrl key
        let video = null;
        const videoEl =
          el.querySelector('[data-hook="review-video-tile"] video') ||
          el.querySelector(".review-video-block video") ||
          el.querySelector("video");
        if (videoEl) {
          video =
            videoEl.getAttribute("src") ||
            videoEl.getAttribute("data-src") ||
            videoEl.querySelector("source")?.getAttribute("src") ||
            null;
        }
        if (!video) {
          const btn = el.querySelector(
            "[data-video-url], [data-cr-video-url], [data-vse-asset-url]"
          );
          video =
            btn?.getAttribute("data-video-url") ||
            btn?.getAttribute("data-cr-video-url") ||
            btn?.getAttribute("data-vse-asset-url") ||
            null;
        }
        if (!video) {
          // Fallback: scan inner HTML for an .mp4 URL
          const html = el.innerHTML;
          const m = html.match(/https?:\/\/[^"'\s<>]+?\.mp4[^"'\s<>]*/i);
          if (m) video = m[0];
        }
        if (video && !/^https?:\/\//i.test(video)) video = null;

        // Source URL — direct link to this individual review on Amazon
        const reviewLink = el.querySelector('[data-hook="review-title"] a')?.href
                        ?? el.id ? `${window.location.origin}/gp/customer-reviews/${el.id}` : null;

        reviews.push({
          rating,
          title:        title || null,
          body,
          author,
          authorAvatar: null,
          date,
          images,
          video,
          sourceUrl: reviewLink,
        });
      } catch (e) {
        // skip this review on parse error
      }
    });

    // Product context — useful for the popup to pre-fill product tagging
    const productTitle = document.getElementById("productTitle")?.textContent?.trim()
                      ?? document.querySelector("h1 .a-text-bold")?.textContent?.trim()
                      ?? document.querySelector('a[data-hook="product-link"]')?.textContent?.trim()
                      ?? "";
    const productImage = document.getElementById("landingImage")?.src
                      ?? document.querySelector("#imgBlkFront")?.src
                      ?? null;

    return {
      source: "amazon",
      productTitle,
      productImage,
      productUrl: window.location.href,
      reviews,
    };
  };

  // Visual nudge: a tiny indicator so the admin knows the scraper is loaded.
  // Only injected once and only on review-bearing pages.
  if (!document.getElementById("gifteeng-grabber-tag")) {
    const tag = document.createElement("div");
    tag.id = "gifteeng-grabber-tag";
    tag.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:99999;" +
      "background:#EF3752;color:white;padding:5px 10px;" +
      "border-radius:14px;font:600 11px -apple-system,sans-serif;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:none;" +
      "opacity:0.85;";
    tag.textContent = "🎁 Gifteeng grabber ready";
    document.body.appendChild(tag);
    setTimeout(() => tag.style.opacity = "0", 3000);
    setTimeout(() => tag.remove(), 4000);
  }
})();
