import type { Metadata } from "next";
import { SellerShell } from "./_components/SellerShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gifteeng Seller Portal",
  description: "Sell your personalised gifts on Gifteeng. Onboard, list products, manage orders.",
  robots: { index: false, follow: false },
};

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-body text-foreground">
      <SellerShell>{children}</SellerShell>
    </div>
  );
}
