import type { Metadata } from "next";
import { Heart, Shield, Zap, Users } from "lucide-react";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "About Gifteeng — Our Story & Mission",
  description:
    "Gifteeng is India's leading personalized gifts store. We craft custom photo frames, mugs, keychains & more with love, quality, and fast delivery.",
  alternates: { canonical: `${SITE}/about` },
  openGraph: {
    title:       "About Gifteeng — Our Story & Mission",
    description: "India's personalized gifts store, built with love.",
    url:         `${SITE}/about`,
    type:        "website",
  },
  twitter: {
    card:        "summary",
    title:       "About Gifteeng",
    description: "India's personalized gifts store, built with love.",
  },
};

async function safeGetSetting(key: string): Promise<string | null> {
  // Server-side fetch. NEXT_PUBLIC_API_BASE_URL is now empty so browser
  // fetches go same-origin, but SSG has no origin — use an internal var.
  const base =
    process.env.INTERNAL_API_BASE_URL
    ?? process.env.NEXT_PUBLIC_API_BASE_URL
    ?? "http://127.0.0.1:4000";
  try {
    const res = await fetch(`${base}/api/admin/settings/${key}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { value?: string } | null;
    return json?.value ?? null;
  } catch {
    return null;
  }
}

const values = [
  { icon: Heart, title: "Made with Love", desc: "Every product is crafted with care and attention to detail." },
  { icon: Shield, title: "Quality Guaranteed", desc: "Premium materials and printing for lasting memories." },
  { icon: Zap, title: "Fast Delivery", desc: "Quick production and delivery across India." },
  { icon: Users, title: "3 Lakh+ Happy Customers", desc: "Trusted by over 3,00,000 customers for their special moments." },
];

export default async function AboutPage() {
  const cmsBody = await safeGetSetting("about_body");

  return (
    <div className="relative overflow-hidden pb-24 md:pb-0">
      <section className="pt-24 md:pt-32 pb-14 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Our Story
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-xl mx-auto">
            Gifteeng was born from a simple idea: everyone deserves a gift that speaks from the heart.
            We combine technology with craftsmanship to turn your cherished memories into beautiful,
            personalized gifts.
          </p>
        </div>
      </section>

      {cmsBody ? (
        <section className="py-12 md:py-16">
          <div className="mx-auto max-w-4xl px-4">
            <div className="prose prose-slate max-w-none whitespace-pre-wrap">{cmsBody}</div>
          </div>
        </section>
      ) : null}

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-12 tracking-tight">
            Why Gifteeng?
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8">
            {values.map((v) => (
              <div
                key={v.title}
                className="bg-card rounded-2xl p-6 md:p-7 text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <v.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-sm md:text-base mb-2">{v.title}</h3>
                <p className="text-muted-foreground text-xs md:text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="bg-[#12131A] py-14 md:py-20 rounded-2xl">
            <div className="mx-auto max-w-3xl px-4 grid grid-cols-3 gap-6 text-center">
              {[
                { value: "5L+", label: "Products Delivered" },
                { value: "3,00,000+", label: "Happy Customers" },
                { value: "500+", label: "5-Star Ratings" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-2xl md:text-4xl font-display font-bold text-white">{s.value}</div>
                  <div className="text-white/70 text-xs md:text-sm mt-2 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
