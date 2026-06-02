import type { Metadata } from "next";

// `cart/page.tsx` is "use client" so it can't export metadata directly.
// This sibling layout adds the SEO-critical `robots: noindex` flag so
// authenticated/cart URLs never end up in search results, even if linked
// externally. robots.ts already blocks crawling; this hardens against
// indexing via inbound links.
export const metadata: Metadata = {
  title: "Your Cart | Gifteeng",
  description: "Review the items in your Gifteeng cart and proceed to checkout.",
  robots: { index: false, follow: true },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
