/**
 * Deals of the Day — Server Component wrapper
 * Products with 60%+ discount (discountPct >= 60, mrp set).
 */
import type { Metadata } from "next";
import DealsClient from "./_DealsClient";

export const metadata: Metadata = {
  title: "Deals of the Day — Up to 70% Off | Gifteeng",
  description:
    "Grab today's best deals on gifts — handpicked products with 60% or more off. Limited time offers on personalised gifts, decor, jewellery and more.",
};

export default function DealsPage() {
  return <DealsClient />;
}
