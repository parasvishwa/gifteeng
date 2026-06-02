import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Orders | Gifteeng",
  description: "Track and manage your Gifteeng orders.",
  robots: { index: false, follow: false },
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
