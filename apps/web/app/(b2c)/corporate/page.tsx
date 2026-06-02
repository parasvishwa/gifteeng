import type { Metadata } from "next";
import { ArrowRight, Check, Users, Tag, UserCheck, FileText, MapPin, Zap, Building2, Landmark, Factory, HeartPulse, ShoppingCart, Rocket, ClipboardList, BadgeCheck, Truck } from "lucide-react";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "Corporate Gifting India — Bulk Gifts with GST Invoice | Gifteeng",
  description:
    "Corporate gifting made simple. Bulk orders, custom branding, GST invoices, and pan-India delivery. Trusted by 500+ companies. Get a custom quote today.",
  alternates: { canonical: `${SITE}/corporate` },
  openGraph: {
    title: "Corporate Gifting India — Bulk Gifts with GST Invoice | Gifteeng",
    description: "Bulk orders, custom branding, GST invoices, and pan-India delivery for corporate gifting.",
    url: `${SITE}/corporate`,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Corporate Gifting | Gifteeng",
    description: "Bulk orders, custom branding, GST invoices, and pan-India delivery.",
  },
};

const stats = [
  { value: "500+", label: "Corporate clients" },
  { value: "50,000+", label: "Bulk orders delivered" },
  { value: "₹500–₹5L+", label: "Budget range handled" },
];

const features = [
  { icon: Tag, title: "Bulk Discounts", desc: "Tiered pricing that saves more as your order grows. Best rates on 50+ unit orders." },
  { icon: Users, title: "Custom Branding", desc: "Add your company logo, brand colours, and messaging to every product and packaging." },
  { icon: UserCheck, title: "Dedicated Manager", desc: "A dedicated account manager handles your order from quote to delivery." },
  { icon: FileText, title: "GST Invoice", desc: "Get proper GST-compliant invoices for all corporate purchases — claim input tax credit easily." },
  { icon: MapPin, title: "Pan-India Delivery", desc: "We deliver to 27,000+ pincodes across India, including Tier 2 and Tier 3 cities." },
  { icon: Zap, title: "Same-Day Dispatch", desc: "In-stock orders can be dispatched same day for urgent gifting requirements." },
];

const industries = [
  { icon: Building2, label: "IT Companies" },
  { icon: Landmark, label: "Banks & Finance" },
  { icon: Factory, label: "Manufacturing" },
  { icon: HeartPulse, label: "Healthcare" },
  { icon: ShoppingCart, label: "FMCG" },
  { icon: Rocket, label: "Startups" },
];

const processSteps = [
  {
    icon: ClipboardList,
    step: "01",
    title: "Share requirements",
    desc: "Tell us your occasion, quantity, budget, and branding needs via email or WhatsApp.",
  },
  {
    icon: FileText,
    step: "02",
    title: "Get a custom quote",
    desc: "We send a detailed quote within 24 hours with product options, pricing, and timelines.",
  },
  {
    icon: BadgeCheck,
    step: "03",
    title: "Approve & pay",
    desc: "Review the proposal, approve samples if needed, and make a secure payment.",
  },
  {
    icon: Truck,
    step: "04",
    title: "Delivered on time",
    desc: "Your branded gifts are delivered directly to your office or multiple recipient addresses.",
  },
];

const WA_LINK = "https://wa.me/919999999999?text=Hi%2C%20I%20need%20a%20corporate%20gifting%20quote%20from%20Gifteeng.";
const MAIL_LINK = "mailto:corporate@gifteeng.com";

export default function CorporatePage() {
  return (
    <div className="relative overflow-hidden pb-24 md:pb-0">
      {/* Hero */}
      <section className="pt-24 md:pt-32 pb-14 md:pb-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EF3752]/10 text-[#EF3752] text-xs font-bold mb-5">
            <Building2 className="w-3.5 h-3.5" />
            Corporate Gifting
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Corporate Gifting,{" "}
            <span className="bg-gradient-to-r from-[#EF3752] to-purple-500 bg-clip-text text-transparent">
              Simplified
            </span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-xl mx-auto mb-8">
            From employee appreciation to client gifting — bulk orders with custom branding, GST invoices,
            and pan-India delivery. Trusted by 500+ companies across India.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#EF3752] text-white font-black text-base hover:bg-[#d4304a] transition-colors"
            >
              Get a Quote on WhatsApp <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={MAIL_LINK}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-border font-bold text-base hover:bg-muted transition-colors"
            >
              Email Us
            </a>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="py-10 md:py-12 bg-[#12131A]">
        <div className="mx-auto max-w-3xl px-4">
          <div className="grid grid-cols-3 gap-6 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-2xl md:text-3xl font-display font-bold text-white">{s.value}</div>
                <div className="text-white/60 text-xs md:text-sm mt-1.5 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-12 tracking-tight">
            Everything You Need
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-card rounded-2xl p-5 md:p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-sm md:text-base mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-xs md:text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-4 tracking-tight">
            Industries We Serve
          </h2>
          <p className="text-muted-foreground text-center text-sm md:text-base mb-10 max-w-md mx-auto">
            From fast-growing startups to large enterprises, Gifteeng powers corporate gifting across sectors.
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {industries.map((ind) => (
              <div key={ind.label} className="bg-card rounded-2xl p-4 flex flex-col items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#EF3752]/10 flex items-center justify-center">
                  <ind.icon className="w-4.5 h-4.5 text-[#EF3752]" />
                </div>
                <span className="text-xs font-bold text-center leading-tight">{ind.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-12 tracking-tight">
            How It Works
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {processSteps.map((p) => (
              <div key={p.step} className="bg-card rounded-2xl p-5 md:p-6 relative">
                <span className="absolute top-4 right-4 text-3xl font-black text-muted-foreground/20 font-display">
                  {p.step}
                </span>
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <p.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-sm mb-1.5">{p.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="mx-auto max-w-2xl px-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#EF3752]/10 to-purple-500/10 border border-border p-8 md:p-10 text-center">
            <h2 className="font-display font-bold text-2xl md:text-3xl mb-3 tracking-tight">
              Ready to Place a Bulk Order?
            </h2>
            <p className="text-muted-foreground text-sm md:text-base mb-6 max-w-md mx-auto">
              Get a custom quote within 24 hours. Share your requirements and we will take care of the rest.
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-4 text-sm mb-8">
              {["No minimum order value", "GST invoice guaranteed", "Pan-India delivery", "Custom branding"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#EF3752] text-white font-black hover:bg-[#d4304a] transition-colors"
              >
                WhatsApp Us <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={MAIL_LINK}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-border font-bold hover:bg-background transition-colors"
              >
                corporate@gifteeng.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
