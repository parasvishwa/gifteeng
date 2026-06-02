import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { ReturnOrderForm } from "./ReturnOrderForm";

export const metadata: Metadata = {
  title: "Return Order — Gifteeng",
  description: "Initiate a return for your Gifteeng order.",
};

export default async function OrderReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="relative">
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-2xl px-4">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="w-7 h-7 text-primary" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-black mb-3 tracking-tight">Return Order</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Order{" "}
              <span className="font-mono font-semibold text-foreground">#{id}</span> &mdash; tell us what went
              wrong and we&apos;ll make it right.
            </p>
          </div>

          <ReturnOrderForm orderId={id} />

          <div className="mt-8 text-center">
            <Link href="/returns" className="text-primary text-sm hover:underline">
              Read our full return policy
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
