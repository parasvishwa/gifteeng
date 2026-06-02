import type { Metadata } from "next";

// Server-component layout providing per-page metadata for the client-side
// ai-design page.
export const metadata: Metadata = {
  title: "AI Gift Designer — Describe the Person, Get a Custom Design",
  description:
    "Tell Gifteeng's AI about the recipient and the occasion, and get a unique personalised gift design generated in seconds. Free preview, pay only when you order.",
  alternates: { canonical: "/ai-design" },
  openGraph: {
    title: "AI Gift Designer — Custom Gifts Made by AI",
    description:
      "Describe the occasion. Our AI designs the gift. You order. Personalised mugs, frames, prints, and more — all unique to the person you're gifting.",
    url: "/ai-design",
    type: "website",
  },
};

export default function AiDesignLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
