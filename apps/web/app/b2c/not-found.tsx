"use client";

/**
 * B2C 404 page — fires a `404_view` analytics event so admin can spot
 * broken links / dead routes from the activity feed.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Home, Search, ArrowLeft } from "lucide-react";

export default function NotFound() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.gifteengTrack) {
      window.gifteengTrack("404_view", {
        path:     window.location.pathname,
        referrer: document.referrer || null,
      });
    }
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-7xl mb-4">🎁</div>
        <h1 className="text-3xl font-black mb-2">Oops! Page not found</h1>
        <p className="text-muted-foreground mb-6">
          The link you followed may be broken, or the page may have been moved.
          Let's get you back to finding the perfect gift.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EF3752] text-white font-bold text-sm"
          >
            <Home className="w-4 h-4" /> Go home
          </Link>
          <Link
            href="/b2c/products"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card font-bold text-sm hover:bg-muted"
          >
            <Search className="w-4 h-4" /> Browse gifts
          </Link>
          <button
            onClick={() => typeof window !== "undefined" && window.history.back()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card font-bold text-sm hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" /> Go back
          </button>
        </div>
      </div>
    </div>
  );
}
