import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout | Gifteeng",
  description: "Complete your Gifteeng order — secure checkout, fast delivery.",
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
