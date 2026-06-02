import type { Metadata } from "next";
import GiftCardDesigner from "./GiftCardDesigner";

export const metadata: Metadata = {
  title: "E-Gift Cards | Gifteeng — Send Instantly via Email or WhatsApp",
  description:
    "Send a premium digital gift card from Gifteeng. Pick a design, amount (₹100–₹10,000+), write a personal message, and we'll deliver it instantly to the recipient's email or WhatsApp. Perfect when you can't decide the gift.",
  alternates: { canonical: (process.env.NEXT_PUBLIC_SITE_URL || "https://new.gifteeng.com") + "/gift-cards" },
  openGraph: {
    title: "E-Gift Cards | Gifteeng",
    description: "Send an instant digital gift card via email or WhatsApp. Pick a design, add a personal message.",
    type: "website",
  },
};

export default function GiftCardsPage() {
  return <GiftCardDesigner />;
}
