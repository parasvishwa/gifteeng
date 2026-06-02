import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Account | Gifteeng",
  description: "Manage your Gifteeng account, addresses, orders, and preferences.",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
