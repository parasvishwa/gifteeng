import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wishlist | Gifteeng",
  description: "Your saved gift ideas on Gifteeng.",
  robots: { index: false, follow: false },
};

export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
