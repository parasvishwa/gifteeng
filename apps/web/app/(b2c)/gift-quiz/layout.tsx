import type { Metadata } from "next";

// The gift-quiz page is a client component, so per-page metadata lives here
// in a server-component layout. Picked up by Next's metadata cascade.
export const metadata: Metadata = {
  title: "Gift Finder Quiz — Find the Perfect Personalised Gift",
  description:
    "Answer 6 quick questions and let Gifteeng's gift finder pick the most thoughtful personalised gift — for any age, occasion, or budget. Free to use.",
  alternates: { canonical: "/gift-quiz" },
  openGraph: {
    title: "Gift Finder Quiz — Find the Perfect Gift in 60 Seconds",
    description:
      "Stuck on what to gift? Our quiz narrows down 500+ personalised options to your top 3 in under a minute.",
    url: "/gift-quiz",
    type: "website",
  },
};

export default function GiftQuizLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
