"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const categories = [
  {
    name: "Orders & Delivery",
    items: [
      {
        q: "How long does delivery take?",
        a: "Standard delivery takes 2–5 business days. Same-day delivery is available in select cities (Mumbai, Delhi, Bangalore, Hyderabad, Pune). You will see delivery estimates on the product page.",
      },
      {
        q: "Can I track my order?",
        a: "Yes! Visit /track and enter your order ID, or check the tracking link sent to your email and phone via SMS after dispatch.",
      },
      {
        q: "Do you deliver pan-India?",
        a: "Yes, we deliver to 27,000+ pincodes across India — including Tier 2 and Tier 3 cities.",
      },
      {
        q: "What if my order is delayed?",
        a: "Contact our support team via chat or email at support@gifteeng.com. We will investigate immediately and make it right — with a refund or re-delivery.",
      },
    ],
  },
  {
    name: "Returns & Refunds",
    items: [
      {
        q: "What is the return policy?",
        a: "We accept returns within 7 days of delivery for damaged or wrong items. Personalised products are non-returnable unless they arrive damaged or incorrect.",
      },
      {
        q: "How do refunds work?",
        a: "Approved refunds are processed within 3–5 business days back to your original payment method (UPI, card, wallet, etc.).",
      },
      {
        q: "Can I cancel my order?",
        a: "Yes, you can cancel before the order is dispatched. Contact support immediately after placing the order. Personalised orders cannot be cancelled once production starts.",
      },
    ],
  },
  {
    name: "Customisation",
    items: [
      {
        q: "How does product customisation work?",
        a: "On the product page, use our live canvas editor to upload your photo, add text, choose colours, and position elements. You see a real-time preview before adding to cart.",
      },
      {
        q: "How long does a customised order take?",
        a: "Personalised products require 1–2 additional working days for production before dispatch. The estimated delivery date shown at checkout includes this.",
      },
      {
        q: "Can I preview my design before ordering?",
        a: "Yes! Our product pages feature a live canvas preview so you can see exactly how your design will look on the product before placing the order.",
      },
    ],
  },
  {
    name: "Payments & Offers",
    items: [
      {
        q: "What payment methods do you accept?",
        a: "We accept UPI (GPay, PhonePe, Paytm), credit/debit cards, net banking, Cash on Delivery (COD), and all major wallets via Razorpay.",
      },
      {
        q: "What are Goins?",
        a: "Goins are Gifteeng reward coins. You earn Goins on every order and can redeem them for discounts on future purchases. Check your Goins balance in your account dashboard.",
      },
      {
        q: "How do I apply a coupon?",
        a: "Enter your coupon code in the Coupon Code box on the checkout page before placing the order. The discount is applied instantly.",
      },
    ],
  },
  {
    name: "Gifting & Occasions",
    items: [
      {
        q: "Can I send a gift directly to someone?",
        a: "Yes! At checkout, enter the recipient's name, address, and phone number as the delivery address. The gift goes straight to them.",
      },
      {
        q: "Do you offer gift wrapping?",
        a: "Yes, premium gift wrapping is available for select products. Choose the gift wrap option at checkout for a small additional charge.",
      },
      {
        q: "Can I schedule delivery for a specific date?",
        a: "Scheduled delivery is available for select pincodes. Choose your preferred date in the delivery options at checkout.",
      },
    ],
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-sm md:text-base">{q}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <p className="pb-4 text-muted-foreground text-sm leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export function FaqContent() {
  return (
    <section className="pb-20">
      <div className="mx-auto max-w-2xl px-4 space-y-6">
        {categories.map((cat) => (
          <div key={cat.name} className="bg-card rounded-2xl p-5 md:p-6">
            <h2 className="font-display font-bold text-base md:text-lg mb-3 text-[#EF3752]">
              {cat.name}
            </h2>
            <div>
              {cat.items.map((item) => (
                <AccordionItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-2xl px-4 mt-10">
        <div className="rounded-2xl bg-gradient-to-br from-[#EF3752]/10 to-purple-500/10 border border-border p-6 text-center">
          <h3 className="font-display font-bold text-lg mb-2">Still have questions?</h3>
          <p className="text-muted-foreground text-sm mb-5">
            Our support team is available 9 AM – 9 PM, 7 days a week.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="mailto:support@gifteeng.com"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EF3752] text-white font-bold text-sm hover:bg-[#d4304a] transition-colors"
            >
              Email Support
            </a>
            <a
              href="https://wa.me/919999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border font-bold text-sm hover:bg-muted transition-colors"
            >
              WhatsApp Us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
