import type { Metadata } from "next";
import { ArrowRight, Check, Package, ShoppingBag, Wallet, Users, Store, Cake, Gift, Building2 } from "lucide-react";
import Link from "next/link";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "Sell on Gifteeng — Reach 3 Lakh+ Gift Buyers",
  description:
    "Start selling on Gifteeng. List your handcrafted gifts, get orders from 3 lakh+ buyers, and get paid in 17 days. 10% commission, no hidden fees.",
  alternates: { canonical: `${SITE}/sell` },
  openGraph: {
    title: "Sell on Gifteeng — Reach 3 Lakh+ Gift Buyers",
    description: "Turn your craft into a business. Join Gifteeng's seller network.",
    url: `${SITE}/sell`,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Sell on Gifteeng",
    description: "Turn your craft into a business. Join Gifteeng's seller network.",
  },
};

const stats = [
  { value: "3,00,000+", label: "Happy customers" },
  { value: "₹2Cr+", label: "Seller earnings" },
  { value: "50+", label: "Seller categories" },
  { value: "Same-day", label: "Onboarding" },
];

const steps = [
  {
    icon: Package,
    step: "01",
    title: "List your products",
    desc: "Upload photos, set prices, and describe your products. Our team reviews listings within 24 hours.",
  },
  {
    icon: ShoppingBag,
    step: "02",
    title: "Get orders",
    desc: "Customers find and buy your products. We handle marketing, SEO, and pan-India delivery logistics.",
  },
  {
    icon: Wallet,
    step: "03",
    title: "Get paid in 17 days",
    desc: "Receive your earnings directly to your bank account 17 days after confirmed delivery.",
  },
];

const sellerTypes = [
  { icon: Users, title: "Individual Artisans", desc: "Potters, weavers, painters, and craftspeople with unique handmade products." },
  { icon: Cake, title: "Home Bakers", desc: "Custom cakes, cookies, and baked treats for gifting occasions." },
  { icon: Gift, title: "Gift Curators", desc: "Curated hampers, themed gift boxes, and ready-to-gift collections." },
  { icon: Building2, title: "Businesses", desc: "Registered businesses looking to expand their gifting product reach." },
];

const faqs = [
  {
    q: "How much does it cost to sell on Gifteeng?",
    a: "Listing is free. We charge a flat 10% commission on each completed sale — no hidden fees, no monthly subscription.",
  },
  {
    q: "When and how do I get paid?",
    a: "Earnings are transferred to your registered bank account 17 days after the order is marked delivered. We pay weekly in batches.",
  },
  {
    q: "Who handles shipping and delivery?",
    a: "We handle all logistics through our courier partners. You just need to pack the order and hand it over to our pickup agent.",
  },
  {
    q: "Can I sell customisable or personalised products?",
    a: "Yes! Our platform supports live canvas customisation. Buyers can personalise products with names, photos, and messages before ordering.",
  },
];

export default function SellPage() {
  return (
    <div className="relative overflow-hidden pb-24 md:pb-0">
      {/* Hero */}
      <section className="pt-24 md:pt-32 pb-14 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EF3752]/10 text-[#EF3752] text-xs font-bold mb-5">
            <Store className="w-3.5 h-3.5" />
            Gifteeng Seller Network
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Turn Your Craft Into{" "}
            <span className="bg-gradient-to-r from-[#EF3752] to-purple-500 bg-clip-text text-transparent">
              a Business
            </span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-xl mx-auto mb-8">
            Join thousands of sellers on Gifteeng — India&apos;s fastest-growing personalized gifts
            marketplace. Reach over 3 lakh buyers who are actively looking for unique, handcrafted gifts.
          </p>
          <Link
            href="/seller"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#EF3752] text-white font-black text-base hover:bg-[#d4304a] transition-colors"
          >
            Start Selling Today <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Stats strip */}
      <section className="py-10 md:py-12 bg-[#12131A]">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-2xl md:text-3xl font-display font-bold text-white">{s.value}</div>
                <div className="text-white/60 text-xs md:text-sm mt-1.5 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-12 tracking-tight">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.step} className="bg-card rounded-2xl p-6 md:p-7 relative">
                <span className="absolute top-5 right-5 text-4xl font-black text-muted-foreground/20 font-display">
                  {s.step}
                </span>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <s.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-base mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who can sell */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-4 tracking-tight">
            Who Can Sell on Gifteeng?
          </h2>
          <p className="text-muted-foreground text-center text-sm md:text-base mb-12 max-w-lg mx-auto">
            Whether you&apos;re a solo artisan or a registered business, there&apos;s a place for you on our marketplace.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {sellerTypes.map((t) => (
              <div key={t.title} className="bg-card rounded-2xl p-5 md:p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#EF3752]/10 flex items-center justify-center mx-auto mb-4">
                  <t.icon className="w-5 h-5 text-[#EF3752]" />
                </div>
                <h3 className="font-display font-bold text-sm md:text-base mb-2">{t.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commission */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#EF3752]/10 to-purple-500/10 border border-border p-8 md:p-10 text-center">
            <div className="text-4xl md:text-5xl font-display font-black mb-3">
              10%
              <span className="text-lg md:text-2xl text-muted-foreground font-medium ml-2">commission</span>
            </div>
            <p className="text-base md:text-lg font-medium mb-2">No hidden fees. No monthly charges.</p>
            <p className="text-muted-foreground text-sm md:text-base mb-8 max-w-md mx-auto">
              Get paid 17 days after delivery, straight to your bank account. We only earn when you earn.
            </p>
            <ul className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm mb-8">
              {["Free listing", "Logistics covered", "Weekly payouts", "Seller dashboard"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/seller"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#EF3752] text-white font-black hover:bg-[#d4304a] transition-colors"
            >
              Create Your Seller Account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-10 tracking-tight">
            Seller FAQs
          </h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="bg-card rounded-2xl p-5 md:p-6">
                <h3 className="font-bold text-sm md:text-base mb-2">{faq.q}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8">
            More questions?{" "}
            <a href="mailto:vendors@gifteeng.com" className="text-[#EF3752] font-semibold underline underline-offset-2">
              vendors@gifteeng.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
