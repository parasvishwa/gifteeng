/**
 * Homepage — Server Component Entry Point
 *
 * Why server component?  Google crawls the initial HTML. A pure "use client"
 * page means all product content is fetched AFTER JavaScript runs — Google
 * sees an empty shell. Converting to a server component means:
 *   • generateMetadata runs server-side → correct <title>/<meta> in HTML
 *   • heroSlides + homeConfig are pre-fetched → hero image + H1 in initial HTML
 *   • All interactive parts (HeroSearch, product rows, etc.) still hydrate
 *     normally via HomePageShell ("use client")
 */
import type { Metadata } from "next";
import { HomePageShell } from "./_HomePageShell";
import type { HeroSlide } from "./_components/sections/HeroSlider";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

// ── Page-level SEO metadata ─────────────────────────────────────────────────
// Overrides root layout defaults for the homepage specifically. Keywords are
// long-tail — "personalized gifts India", "custom birthday gifts online" etc.
// — matching common gift-shopping search intent.
export const metadata: Metadata = {
  title: "Personalized Gifts India — Custom Photo Frames, Mugs & More",
  description:
    "Shop 500+ personalized gifts in India — custom photo frames, mugs, keychains & more. Starting ₹99. Free delivery on orders ₹499+.",
  alternates: { canonical: `${SITE}/` },
  keywords: [
    "personalized gifts India",
    "custom gifts online India",
    "birthday gifts India",
    "anniversary gifts online",
    "custom photo frames",
    "personalized mugs India",
    "custom keychains India",
    "wedding gifts India",
    "corporate gifting India",
    "best personalized gift site India",
    "online gift delivery India",
    "customizable gifts India",
    "return gifts",
    "Gifteeng",
  ],
  openGraph: {
    title: "Gifteeng — Personalized Gifts That Create Forever Memories",
    description:
      "500+ handcrafted personalized gifts delivered across India. Custom photo frames, mugs, keychains & more. Starting ₹99.",
    url: `${SITE}/`,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Gifteeng personalized gifts" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gifteeng — Personalized Gifts India",
    description: "500+ personalized gifts. Starting ₹99. Free delivery.",
    images: ["/opengraph-image"],
  },
};

// ── Type aliases (keep in sync with HeroSlider + HomepageBlocks) ────────────
type HomeConfigSection = {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  active: boolean;
  visibility?: { mobile?: boolean; desktop?: boolean };
  order: number;
  config: Record<string, unknown>;
};
type HomeConfig = { version: number; sections: HomeConfigSection[] } | null;

async function safeJson<T>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function HomePage() {
  // Internal API URL for server-side fetches. INTERNAL_API_BASE_URL is set
  // in production so the server process can reach the API on a private network
  // without going through the public load-balancer. Falls back to the env var
  // used in the browser for local dev / CI.
  const api =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:4000";

  // Fetch in parallel — failures are swallowed so a dead API never breaks the page.
  const [bannersResult, configResult, settingsResult, bestSellingResult, newArrivalsResult, pickedResult] = await Promise.allSettled([
    safeJson<HeroSlide[]>(`${api}/api/banners?placement=home`, {
      next: { revalidate: 300 }, // re-check every 5 min
    }),
    safeJson<{
      heroSlides?: HeroSlide[];
      sections?: unknown[];
      config?: unknown;
    }>(`${api}/api/homepage/config`, {
      next: { revalidate: 60 }, // config changes faster than banners
    }),
    // Hero copy — Tagline / Heading / Highlight / Subtitle / buttons —
    // ships from /api/settings/public so admins can edit copy without a
    // redeploy. Defaults baked into the API match the previous hardcoded
    // copy, so a fresh install renders identically.
    safeJson<Record<string, unknown>>(`${api}/api/settings/public`, {
      next: { revalidate: 60 },
    }),
    // Pre-fetch the two most common product-row sources so HomepageBlocks
    // can render them in the initial HTML without a client-side waterfall.
    // This is the primary LCP fix — product images load immediately.
    safeJson<{ items?: unknown[] }>(`${api}/api/products?sort=popular&pageSize=12`, {
      next: { revalidate: 120 },
    }),
    safeJson<{ items?: unknown[] }>(`${api}/api/products?sort=newest&pageSize=12`, {
      next: { revalidate: 120 },
    }),
    // Pre-fetch "Picked For You" fallback (anonymous trending) so the section
    // renders product cards in the initial HTML — Google crawls them immediately
    // and cold visitors see content instead of skeletons. After hydration the
    // client re-fetches with view history / auth for personalisation.
    safeJson<{ items?: unknown[] }>(`${api}/api/recommendations?limit=12`, {
      next: { revalidate: 180 }, // trending changes every ~3 min
    }),
  ]);

  const bannersData =
    bannersResult.status === "fulfilled" ? (bannersResult.value ?? []) : [];
  const configData =
    configResult.status === "fulfilled" ? configResult.value : null;
  const settingsData =
    settingsResult.status === "fulfilled" ? (settingsResult.value ?? {}) : {};
  // Cast to `any[]` — ApiProduct is defined inside HomepageBlocks and not
  // exported; the shape is compatible. The preloaded data is passed straight
  // through; HomepageBlocks assigns it to its own ApiProduct[] state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preloadedProducts: Record<string, any[]> = {
    "best-selling": bestSellingResult.status === "fulfilled" ? (bestSellingResult.value?.items ?? []) : [],
    "new-arrivals": newArrivalsResult.status === "fulfilled" ? (newArrivalsResult.value?.items ?? []) : [],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickedForYouInitial: any[] =
    pickedResult.status === "fulfilled" ? (pickedResult.value?.items ?? []) : [];

  // Banners endpoint takes priority; fall back to legacy heroSlides field
  const heroSlides: HeroSlide[] =
    Array.isArray(bannersData) && bannersData.length > 0
      ? (bannersData as HeroSlide[])
      : (configData?.heroSlides ?? []);

  const homeSections: unknown[] = configData?.sections ?? [];
  const rawConfig = configData?.config;
  const homeConfig: HomeConfig =
    rawConfig &&
    typeof rawConfig === "object" &&
    Array.isArray((rawConfig as { sections?: unknown }).sections)
      ? (rawConfig as HomeConfig)
      : null;

  // Pull the hero block out of public settings. Strings only — `hero_show_search`
  // is shipped as a string from the API too, normalise to a bool here.
  const str = (k: string, d: string) => {
    const v = (settingsData as Record<string, unknown>)[k];
    return typeof v === "string" ? v : String(v ?? "") || d;
  };
  const heroCopy = {
    enabled:        str("hero_enabled", "true") !== "false",
    tagline:        str("hero_tagline", "ENGINEER YOUR EMOTIONS"),
    heading:        str("hero_heading", "Personalized Gifts That Create"),
    headingAccent:  str("hero_heading_highlight", "Forever Memories"),
    subtitle:       str("hero_subtitle", "Customized with love. Delivered with happiness."),
    backgroundUrl:  str("hero_background_image", ""),
    button1Text:    str("hero_button_text", "Shop Bestsellers"),
    button1Link:    str("hero_button_link", "/products?sort=popular"),
    button2Text:    str("hero_button2_text", ""),
    button2Link:    str("hero_button2_link", ""),
    showSearch:     str("hero_show_search", "true") !== "false",
  };

  // First hero image URL for preload hint — tells the browser to fetch
  // it at highest priority before it parses the JS bundle.
  const firstHeroImage =
    (Array.isArray(bannersData) && bannersData.length > 0)
      ? ((bannersData[0] as { image?: string; imageUrl?: string }).image
          ?? (bannersData[0] as { image?: string; imageUrl?: string }).imageUrl
          ?? "")
      : "";

  return (
    <>
      {/* ── Hero image preload — LCP fix. Next.js App Router allows <link>
          tags directly in RSC output; they are hoisted into <head>
          automatically. Instructs the browser to fetch the banner image at
          highest priority before JS is parsed. ── */}
      {firstHeroImage && (
        <link rel="preload" as="image" href={firstHeroImage} fetchPriority="high" />
      )}

      {/* ── Server-rendered H1 — crawlable by Google without JS execution.
          Visually hidden but semantically present. The visual heading lives
          inside HeroSlider (client component) — this ensures one H1 is
          always in the initial server HTML regardless of banner state. ── */}
      <h1 className="sr-only">
        Personalized Gifts India — Custom Photo Frames, Mugs, Keychains & More
      </h1>

      <HomePageShell
        heroSlides={heroSlides}
        homeSections={homeSections}
        homeConfig={homeConfig}
        heroCopy={heroCopy}
        preloadedProducts={preloadedProducts}
        pickedForYouInitial={pickedForYouInitial}
      />

      {/* ── SEO body copy — server-rendered prose that gives Google sentence-
          level context for keyword ranking. Not visible in the hero flow but
          rendered as a brand statement section at the bottom of the page. ── */}
      <section className="mx-auto max-w-5xl px-4 py-12 text-center border-t border-border/20">
        <h2 className="text-xl font-bold mb-4 text-foreground">
          India&apos;s Most-Loved Personalized Gift Store
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mx-auto mb-4">
          Gifteeng is India&apos;s premium destination for personalized and customized gifts.
          Whether you&apos;re looking for custom photo frames, personalized mugs, engraved keychains,
          name plates, or curated gift hampers — we bring your memories to life with
          high-quality printing and expert craftsmanship. Every gift is made to order,
          delivered pan-India within 2–5 days.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mx-auto mb-4">
          From birthday gifts and anniversary surprises to wedding favours, return gifts,
          and corporate gifting — our catalog of 500+ products covers every occasion and
          every budget, starting at just ₹99. Free delivery on orders over ₹499.
          Same-day dispatch on select products.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mx-auto">
          Trusted by 3,00,000+ happy customers across Mumbai, Delhi, Bangalore, Hyderabad,
          Chennai, Pune, and every pin code in India. Rated 4.5★ across 5,000+ verified reviews.
          Custom photo gifts, bulk corporate orders, and B2B partnerships welcome.
          WhatsApp us at +91 80700 11777 or email support@gifteeng.com.
        </p>
      </section>
    </>
  );
}
