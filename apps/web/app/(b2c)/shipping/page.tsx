import type { Metadata } from "next";
import Link from "next/link";
import { Truck, Clock, MapPin, Package, AlertTriangle, Phone } from "lucide-react";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "Shipping Policy – Gifteeng",
  description:
    "Learn about Gifteeng's shipping timelines, delivery zones, free shipping thresholds, and what to do if your order is delayed.",
  alternates: { canonical: `${SITE}/shipping` },
  openGraph: {
    title:       "Shipping Policy – Gifteeng",
    description: "Delivery timelines & shipping zones across India.",
    url:         `${SITE}/shipping`,
    type:        "website",
  },
  twitter: {
    card:        "summary",
    title:       "Shipping Policy – Gifteeng",
    description: "Delivery timelines & shipping zones across India.",
  },
};

const ZONES = [
  { zone: "Metro Cities", cities: "Mumbai, Delhi, Bengaluru, Chennai, Hyderabad, Kolkata, Pune, Ahmedabad", standard: "3–5 days", express: "1–2 days" },
  { zone: "Tier-2 Cities", cities: "Jaipur, Lucknow, Surat, Nagpur, Indore, Bhopal, Chandigarh, Kochi", standard: "4–6 days", express: "2–3 days" },
  { zone: "Tier-3 & Others", cities: "Remaining serviceable pin codes across India", standard: "6–9 days", express: "3–5 days" },
  { zone: "Custom / Personalised", cities: "All zones — add 2–3 extra business days for production", standard: "7–12 days", express: "4–7 days" },
];

export default function ShippingPolicyPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-muted/40 py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 mb-6">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">Shipping Policy</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            We deliver across India with care. Here is everything you need to know about shipping timelines, costs, and what happens if something goes wrong.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-4xl px-4 space-y-14">

          {/* Quick badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Truck,         label: "Pan-India",       sub: "Delivery" },
              { icon: Clock,         label: "3–12 Days",       sub: "Estimated" },
              { icon: Package,       label: "Free Shipping",   sub: "On orders ₹599+" },
              { icon: Phone,         label: "Live Tracking",   sub: "SMS + WhatsApp" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex flex-col items-center text-center gap-2 p-4 rounded-2xl bg-muted border border-border">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Timelines */}
          <div>
            <h2 className="font-display text-2xl font-bold mb-2">Delivery Timelines</h2>
            <p className="text-muted-foreground mb-6">All timelines are in <strong>business days</strong> (Monday–Saturday, excluding public holidays) from the date of order confirmation.</p>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-foreground">Zone</th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground">Coverage</th>
                    <th className="text-center px-4 py-3 font-semibold text-foreground">Standard</th>
                    <th className="text-center px-4 py-3 font-semibold text-foreground">Express</th>
                  </tr>
                </thead>
                <tbody>
                  {ZONES.map((row, i) => (
                    <tr key={row.zone} className={i % 2 === 0 ? "bg-background" : "bg-muted/40"}>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{row.zone}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{row.cities}</td>
                      <td className="px-4 py-3 text-center font-semibold text-primary">{row.standard}</td>
                      <td className="px-4 py-3 text-center font-semibold text-secondary">{row.express}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Express shipping availability and cost shown at checkout based on your pin code.</p>
          </div>

          {/* Shipping costs */}
          <div id="costs">
            <h2 className="font-display text-2xl font-bold mb-4">Shipping Costs</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { title: "Free Shipping", desc: "On all orders above ₹599. Threshold may change during sale events — shown at checkout.", highlight: true },
                { title: "Standard", desc: "₹49 flat for orders below ₹599. Applied automatically at checkout.", highlight: false },
                { title: "Express", desc: "₹99–₹149 depending on pin code and weight. Available on select products.", highlight: false },
              ].map(({ title, desc, highlight }) => (
                <div key={title} className={`p-5 rounded-2xl border ${highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border"}`}>
                  <p className={`font-bold text-base mb-1 ${highlight ? "text-primary" : "text-foreground"}`}>{title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* How shipping works */}
          <div>
            <h2 className="font-display text-2xl font-bold mb-6">How Your Order Ships</h2>
            <div className="space-y-4">
              {[
                { step: "1", title: "Order Confirmed", desc: "You receive an email/WhatsApp confirmation with your order summary within minutes of placing your order." },
                { step: "2", title: "Production (custom items)", desc: "Personalised products go into print/production. Standard products are picked and packed directly." },
                { step: "3", title: "Quality Check & Packing", desc: "Every order is inspected before packing. We use protective packaging to prevent damage in transit." },
                { step: "4", title: "Dispatched", desc: "You receive your AWB (tracking ID) via SMS and WhatsApp. Orders are picked up by our logistics partner." },
                { step: "5", title: "Delivered", desc: "Our courier partner delivers to your address. OTP may be required for high-value orders." },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">{step}</div>
                  <div>
                    <p className="font-semibold text-foreground">{title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tracking */}
          <div>
            <h2 className="font-display text-2xl font-bold mb-3">Order Tracking</h2>
            <p className="text-muted-foreground mb-4">
              Once dispatched, track your order at any time via:
            </p>
            <ul className="space-y-2.5">
              {[
                "Your Account → Order History → View Order",
                "gifteeng.com/track (enter Order ID + phone number)",
                "AWB link sent via SMS/WhatsApp after dispatch",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Issues */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <h2 className="font-display text-2xl font-bold">Delays, Damage & Missing Orders</h2>
            </div>
            <ul className="space-y-4">
              {[
                { title: "Delayed delivery", desc: "If your order has not arrived within the stated timeline, please wait an additional 2 business days for courier processing, then contact us at support@gifteeng.com." },
                { title: "Damaged packaging", desc: "If the outer packaging is visibly damaged at delivery, please photograph it before opening and report to us within 24 hours." },
                { title: "Wrong item received", desc: "Contact us within 48 hours of delivery with your order number and a photo of the item received. We will arrange a replacement at no extra cost." },
                { title: "Order marked delivered but not received", desc: "If the tracking shows delivered but you haven't received it, report within 48 hours. We will initiate an investigation with our courier partner." },
                { title: "Failed delivery attempts", desc: "If you miss 3 delivery attempts, the order may be returned to our warehouse. Re-dispatch fees may apply." },
              ].map(({ title, desc }) => (
                <li key={title} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-2" />
                  <div>
                    <span className="font-semibold text-foreground">{title}: </span>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Pin code */}
          <div className="flex items-start gap-4 p-5 rounded-2xl bg-muted border border-border">
            <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground mb-1">Serviceability</p>
              <p className="text-sm text-muted-foreground">
                We ship to 26,000+ pin codes across India. Enter your pin code on the product page or at checkout to confirm serviceability and see the estimated delivery date for your location.
              </p>
            </div>
          </div>

          {/* Related links */}
          <div className="border-t border-border pt-8 flex flex-wrap gap-4 text-sm">
            <Link href="/returns" className="text-primary hover:underline">Return & Refund Policy →</Link>
            <Link href="/terms" className="text-primary hover:underline">Terms & Conditions →</Link>
            <Link href="/contact" className="text-primary hover:underline">Contact Support →</Link>
            <Link href="/track" className="text-primary hover:underline">Track Your Order →</Link>
          </div>
        </div>
      </section>
    </>
  );
}
