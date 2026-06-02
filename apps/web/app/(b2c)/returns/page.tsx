import type { Metadata } from "next";
import ReturnsClient from "./ReturnsClient";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "Return Order – 30 Day Return Policy | Gifteeng",
  description:
    "Easy returns within 30 days. Look up your Gifteeng order to start a return, see our return policy, and get free pickup from your address.",
  alternates: { canonical: `${SITE}/returns` },
  openGraph: {
    title:       "Return Order – Gifteeng",
    description: "Easy 30-day returns with free pickup.",
    url:         `${SITE}/returns`,
    type:        "website",
  },
  twitter: {
    card:        "summary",
    title:       "Return Order – Gifteeng",
    description: "Easy 30-day returns with free pickup.",
  },
};

export const revalidate = 3600;

export default function ReturnsPage() {
  return <ReturnsClient />;
}
