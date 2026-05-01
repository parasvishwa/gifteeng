"use client";

/**
 * /b2c/reviews — public dedicated reviews page.
 *
 * Aggregates Gifteeng-native reviews + external marketplace reviews
 * (Amazon, Flipkart, Myntra, Google, etc.). Each review carries a small
 * source-logo chip, optional product tag, and shows reviewer + rating.
 *
 * Filter: rating >= 4 (server-enforced) — note shown to users.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Star, ChevronDown, MessageSquareQuote, Filter,
} from "lucide-react";

interface Product {
  id: string; slug: string; title: string; imageUrl: string | null;
}

interface AggregatedReview {
  id:           string;
  source:       string;
  sourceLogo:   string | null;
  sourceUrl:    string | null;
  rating:       number;
  title:        string | null;
  body:         string;
  author:       string | null;
  authorAvatar: string | null;
  reviewDate:   string | null;
  photoUrls?:   string[];
  videoUrl?:    string | null;
  product:      Product | null;
  isNative:     boolean;
  createdAt:    string;
}

interface Stats {
  totalReviews:     number;
  averageRating:    number;
  minVisibleRating: number;
  sources:          Array<{ source: string; count: number }>;
}

// Built-in source meta — emoji + label + brand color. The frontend renders
// these when the API doesn't supply a sourceLogo URL override.
const SOURCE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  gifteeng:    { label: "Gifteeng",   emoji: "🎁", color: "text-[#EF3752]",        bg: "bg-[#EF3752]/10" },
  amazon:      { label: "Amazon",     emoji: "📦", color: "text-amber-700",        bg: "bg-amber-500/15" },
  flipkart:    { label: "Flipkart",   emoji: "🛒", color: "text-blue-700",         bg: "bg-blue-500/15" },
  myntra:      { label: "Myntra",     emoji: "👗", color: "text-rose-700",         bg: "bg-rose-500/15" },
  google:      { label: "Google",     emoji: "G",  color: "text-blue-600",         bg: "bg-blue-500/10" },
  meesho:      { label: "Meesho",     emoji: "🛍", color: "text-pink-700",         bg: "bg-pink-500/15" },
  ajio:        { label: "Ajio",       emoji: "🛒", color: "text-purple-700",       bg: "bg-purple-500/15" },
  trustpilot:  { label: "Trustpilot", emoji: "★",  color: "text-emerald-700",      bg: "bg-emerald-500/15" },
  manual:      { label: "Verified",   emoji: "✓",  color: "text-slate-700",        bg: "bg-slate-500/15" },
};

function metaFor(s: string) {
  return SOURCE_META[s] ?? { label: s, emoji: "★", color: "text-foreground", bg: "bg-muted" };
}

const SOURCE_FILTERS = [
  { value: "",          label: "All sources" },
  { value: "gifteeng",  label: "🎁 Gifteeng (verified)" },
  { value: "amazon",    label: "📦 Amazon" },
  { value: "flipkart",  label: "🛒 Flipkart" },
  { value: "myntra",    label: "👗 Myntra" },
  { value: "google",    label: "G Google" },
  { value: "meesho",    label: "🛍 Meesho" },
];

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<AggregatedReview[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [page, setPage]       = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState("");

  const fetchPage = async (p: number, src: string, reset = false) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (src) qs.set("source", src);
      const res = await fetch(`/api/reviews/aggregated?${qs.toString()}`);
      const data = await res.json();
      const items = (data.items ?? []) as AggregatedReview[];
      setReviews((prev) => (reset ? items : [...prev, ...items]));
      setHasMore(items.length === 20);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Stats fetch separately — never gated by source filter
    fetch("/api/reviews/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    fetchPage(1, source, true);
    // eslint-disable-next-line
  }, [source]);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 mb-4">
          <Star className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
          <span className="text-xs font-bold text-amber-700">Verified Customer Voices</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-2">What our community says</h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Real reviews from real shoppers — sourced from Gifteeng, Amazon, Flipkart,
          Myntra and other marketplaces.
        </p>
      </div>

      {/* Aggregate stats */}
      {stats && stats.totalReviews > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-5 flex flex-wrap items-center justify-center gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-5 h-5 ${
                  i < Math.round(stats.averageRating) ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"
                }`} />
              ))}
            </div>
            <p className="text-3xl font-black">{stats.averageRating.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground">{stats.totalReviews.toLocaleString()} reviews</p>
          </div>
          <div className="hidden sm:block w-px h-16 bg-border" />
          <div className="flex flex-wrap gap-2 justify-center">
            {stats.sources.map((s) => {
              const m = metaFor(s.source);
              return (
                <button
                  key={s.source}
                  onClick={() => setSource(source === s.source ? "" : s.source)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${m.bg} ${m.color} ${
                    source === s.source ? "ring-2 ring-current" : ""
                  }`}
                >
                  <span>{m.emoji}</span>
                  {m.label}
                  <span className="opacity-70">· {s.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Visibility note — required by user spec */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 px-3 py-2 mb-4 flex items-center gap-2 text-[11px] text-blue-700 dark:text-blue-300">
        <Filter className="w-3 h-3" />
        Showing only reviews rated <strong>{stats?.minVisibleRating ?? 4} stars or higher</strong> · genuine voices, no inflated noise
      </div>

      {/* Source filter */}
      <div className="flex justify-end mb-4">
        <div className="relative">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="appearance-none pl-3 pr-9 py-2 rounded-lg bg-card border border-border text-sm font-medium cursor-pointer"
          >
            {SOURCE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Reviews */}
      <div className="space-y-3">
        {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        {loading && reviews.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading reviews…</div>
        )}
        {!loading && reviews.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No reviews to show {source && `for ${metaFor(source).label}`}.
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && reviews.length > 0 && (
        <div className="text-center mt-6">
          <button
            onClick={() => { const next = page + 1; setPage(next); fetchPage(next, source); }}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl border border-border bg-card font-bold text-sm hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: AggregatedReview }) {
  const m = metaFor(review.source);
  const date = review.reviewDate ?? review.createdAt;

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {review.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.authorAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-bold text-muted-foreground">
              {(review.author ?? "U").charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Top line — name + source chip */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{review.author ?? "Verified buyer"}</span>
            <SourceChip source={review.source} sourceUrl={review.sourceUrl} />
            {review.isNative && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                ✓ VERIFIED PURCHASE
              </span>
            )}
          </div>

          {/* Stars */}
          <div className="flex items-center gap-1 mt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`w-3.5 h-3.5 ${
                i < review.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"
              }`} />
            ))}
            <span className="text-[11px] text-muted-foreground ml-1.5">
              {date ? new Date(date).toLocaleDateString() : ""}
            </span>
          </div>

          {/* Title + body */}
          {review.title && <h3 className="font-bold text-sm mt-2">{review.title}</h3>}
          <p className="text-sm text-foreground/90 mt-1 leading-relaxed whitespace-pre-line">
            {review.body}
          </p>

          {/* Reviewer-attached media — photos + video */}
          {(review.photoUrls && review.photoUrls.length > 0) || review.videoUrl ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(review.photoUrls ?? []).slice(0, 6).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-16 h-16 rounded overflow-hidden border border-border hover:opacity-80 transition-opacity"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </a>
              ))}
              {review.videoUrl && (
                <a
                  href={review.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-16 h-16 rounded overflow-hidden border border-border bg-black flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                  title="Watch video"
                >
                  ▶
                </a>
              )}
              {(review.photoUrls?.length ?? 0) > 6 && (
                <span className="self-center text-[10px] text-muted-foreground">
                  +{(review.photoUrls?.length ?? 0) - 6} more
                </span>
              )}
            </div>
          ) : null}

          {/* Product tag */}
          {review.product && (
            <Link
              href={`/b2c/products/${review.product.slug}`}
              className="mt-3 inline-flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors group max-w-full"
            >
              {review.product.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={review.product.imageUrl} alt=""
                  className="w-8 h-8 rounded object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Reviewed product</p>
                <p className="text-xs font-bold truncate group-hover:text-[#EF3752] transition-colors">
                  {review.product.title}
                </p>
              </div>
            </Link>
          )}

          {/* External source link */}
          {!review.isNative && review.sourceUrl && (
            <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block text-[11px] text-muted-foreground hover:text-foreground underline">
              View original on {m.label} ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function SourceChip({ source, sourceUrl }: { source: string; sourceUrl: string | null }) {
  const m = metaFor(source);
  const inner = (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black ${m.bg} ${m.color}`}>
      <span className="text-[11px] leading-none">{m.emoji}</span>
      {m.label}
    </span>
  );
  if (!sourceUrl) return inner;
  return <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title={`View on ${m.label}`}>{inner}</a>;
}
