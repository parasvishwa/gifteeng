import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Gift,
  Users,
  Truck,
  Package,
  MessageCircle,
  ArrowRight,
  Star,
  Shield,
  Clock,
} from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Corporate Gifts & Bulk Orders — Gifteeng",
  description:
    "Custom corporate gifts & return gifts for weddings, birthdays, and events. Bulk pricing, company branding, and pan-India delivery.",
};

const benefits = [
  { icon: Package, title: "Bulk Pricing", desc: "Special discounts on orders of 50+ units" },
  { icon: Gift, title: "Custom Branding", desc: "Add your company logo & brand colors" },
  { icon: Truck, title: "Pan-India Delivery", desc: "Deliver to multiple addresses in one order" },
  { icon: Users, title: "Dedicated Manager", desc: "Personal account manager for your orders" },
];

const testimonials = [
  {
    quote: "Gifteeng delivered 500 branded mugs for our annual conference on time and flawlessly.",
    author: "Priya S.",
    role: "HR Lead, TechNova",
  },
  {
    quote: "Their corporate team made return-gift planning for our wedding stress-free.",
    author: "Rahul & Anika",
    role: "Mumbai",
  },
  {
    quote: "Great quality, competitive bulk pricing, and their account manager is responsive.",
    author: "Vikram M.",
    role: "Founder, Brightly",
  },
];

export default function CorporatePage() {
  return (
    <div className="relative">
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="relative overflow-hidden bg-[#12131A] py-16 md:py-24 rounded-2xl">
            <div className="relative max-w-3xl mx-auto px-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#EF3752]/10 flex items-center justify-center mx-auto mb-6">
                <Building2 className="w-8 h-8 text-[#EF3752]" />
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-black mb-5 tracking-tight leading-[1.1]">
                Corporate, Bulk &amp; Return Gifts
              </h1>
              <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                Premium customized gifts for employees, clients, events, weddings &amp; all occasions.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto justify-center">
                <Link
                  href="/b2c/catalogs"
                  className="bg-[#EF3752] text-white px-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-all"
                >
                  <Package className="w-4 h-4" /> Explore Catalog
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <a
                  href="https://wa.me/918070011777?text=Hi! I need bulk/corporate order inquiry."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#25D366] text-white px-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-all"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-black text-2xl md:text-3xl text-center mb-12 tracking-tight">
            Why Choose Gifteeng?
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="bg-card rounded-2xl p-6 md:p-7 shadow-sm hover:-translate-y-1 transition-all text-center"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <b.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-sm md:text-base mb-2">{b.title}</h3>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-black text-2xl md:text-3xl text-center mb-12 tracking-tight">
            Trusted by Teams &amp; Families
          </h2>
          <div className="grid md:grid-cols-3 gap-5 md:gap-8">
            {testimonials.map((t) => (
              <div key={t.author} className="bg-card rounded-2xl p-7 shadow-sm">
                <div className="flex gap-0.5 mb-4 text-primary">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-foreground leading-relaxed mb-5">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <p className="font-display font-bold text-sm">{t.author}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <div className="bg-[#EF3752] rounded-2xl px-6 py-14 md:py-20 text-center">
            <h2 className="font-display font-black text-2xl md:text-4xl text-white mb-4">
              Ready to place a bulk order?
            </h2>
            <p className="text-white/80 text-sm md:text-base max-w-xl mx-auto mb-10">
              Browse our curated corporate catalogs and get a quote within 24 hours.
            </p>
            <Link
              href="/b2c/catalogs"
              className="inline-flex items-center gap-2 bg-white text-[#EF3752] px-8 py-4 rounded-xl font-bold text-base shadow-sm hover:-translate-y-0.5 transition-all"
            >
              Browse Catalogs <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 md:py-14 border-t border-border">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground font-medium">
            {[
              { icon: Star, text: "500+ Corporate Clients" },
              { icon: Truck, text: "Pan-India Delivery" },
              { icon: Shield, text: "Custom Branding" },
              { icon: Clock, text: "Bulk Discounts" },
            ].map((item) => (
              <span
                key={item.text}
                className="flex items-center gap-2 bg-muted px-4 py-2 rounded-full border border-border"
              >
                <item.icon className="w-3.5 h-3.5 text-primary" /> {item.text}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
