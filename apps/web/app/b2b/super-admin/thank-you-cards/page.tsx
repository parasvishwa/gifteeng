"use client";

/**
 * Super-admin: Thank-You Cards library.
 *
 * The actual UI lives in the shared `ThankYouCardsTab` component so it can
 * be reused from the customiser-related modules. This page just frames it
 * with a header + the same look-and-feel used by Customizer / Products.
 */

import { CreditCard } from "lucide-react";
import { Badge } from "@gifteeng/ui";
import ThankYouCardsTab from "../_components/admin/ThankYouCardsTab";

export default function ThankYouCardsPage() {
  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Thank-You Cards</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Library of card designs shown to customers at checkout. They pick a
              design, write their message, and the physical card ships with the order.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">Shipped with order</Badge>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary/80 leading-relaxed">
        <strong>Tip:</strong> upload a clean background image, then drag the text
        area on the preview to land exactly where the card has handwriting space.
        Keep 5-10mm padding from the edge for print bleed.
      </div>

      {/* Library */}
      <ThankYouCardsTab />
    </div>
  );
}
