import type { Metadata } from "next";
import { FaqContent } from "./FaqContent";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "FAQ — Frequently Asked Questions | Gifteeng",
  description:
    "Find answers to common questions about orders, delivery, customisation, returns, payments, and gifting on Gifteeng.",
  alternates: { canonical: `${SITE}/faq` },
  openGraph: {
    title: "FAQ — Frequently Asked Questions | Gifteeng",
    description: "Answers to common questions about orders, delivery, customisation, and more.",
    url: `${SITE}/faq`,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "FAQ | Gifteeng",
    description: "Answers to common questions about orders, delivery, customisation, and more.",
  },
};

export default function FaqPage() {
  return (
    <div className="relative overflow-hidden pb-24 md:pb-0">
      {/* Hero */}
      <section className="pt-24 md:pt-32 pb-12 md:pb-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Frequently Asked{" "}
            <span className="bg-gradient-to-r from-[#EF3752] to-purple-500 bg-clip-text text-transparent">
              Questions
            </span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-lg mx-auto">
            Everything you need to know about ordering, delivery, customisation, and more.
          </p>
        </div>
      </section>

      <FaqContent />
    </div>
  );
}
