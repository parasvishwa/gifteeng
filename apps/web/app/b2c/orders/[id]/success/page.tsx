import Link from "next/link";
import PostOrderScratch from "../../../_components/games/PostOrderScratch";
import DuetShareButton from "../../../_components/games/DuetShareButton";
import PostPurchaseUpsell from "../../../_components/sections/PostPurchaseUpsell";

type Order = {
  id: string;
  orderNumber?: string;
  number?: string;
  status?: string;
  totalLabel?: string;
  total?: number;
  grandTotal?: number;
  currency?: string;
  shippingAddress?: { phone?: string } | null;
};

async function fetchOrder(id: string): Promise<Order | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/orders/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Order;
  } catch {
    return null;
  }
}

function buildWhatsAppUrl(order: Order): string {
  const displayNumber =
    order.orderNumber ?? order.number ?? order.id.slice(0, 8).toUpperCase();
  const total = order.grandTotal ?? order.total ?? 0;
  const text = encodeURIComponent(
    `My Gifteeng order #${displayNumber} of ₹${total} is confirmed! 🎁`,
  );
  const phone = order.shippingAddress?.phone?.replace(/\D/g, "") ?? "";
  const mobile = phone.startsWith("91") ? phone : phone ? `91${phone}` : "";
  return mobile
    ? `https://wa.me/${mobile}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await fetchOrder(id);
  const displayNumber = order
    ? (order.orderNumber ?? order.number ?? order.id.slice(0, 8).toUpperCase())
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <div className="rounded-2xl bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
          ✓
        </div>
        <h1 className="text-3xl font-bold">Thank you for your order!</h1>
        <p className="mt-2 text-muted-foreground">
          We&rsquo;ve received your order and will send you a confirmation
          shortly.
        </p>

        {order ? (
          <div className="mx-auto mt-8 max-w-sm space-y-3 rounded-2xl bg-muted border border-border p-6 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order number</span>
              <span className="font-medium">{displayNumber}</span>
            </div>
            {order.status ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{order.status}</span>
              </div>
            ) : null}
            {order.totalLabel || order.grandTotal || order.total ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">
                  {order.totalLabel ??
                    `${order.currency ?? "₹"}${order.grandTotal ?? order.total}`}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Post-order scratch card reward */}
        {order ? (
          <PostOrderScratch
            orderId={order.id}
            orderValueInr={order.grandTotal ?? order.total ?? 0}
          />
        ) : null}

        {/* Duet Jackpot — send a surprise reward to the recipient */}
        {order ? <DuetShareButton orderId={order.id} /> : null}

        {/* Post-purchase upsell — "People also love…" rail based on the
            order's categories. Mirrors mobile. Hides itself if API has
            no recommendations yet. */}
        {order ? <PostPurchaseUpsell orderId={order.id} /> : null}

        {/* WhatsApp share button */}
        {order ? (
          <div className="mt-6 flex justify-center">
            <a
              href={buildWhatsAppUrl(order)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#22be5a]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.533 5.862L.057 23.57a.75.75 0 0 0 .92.92l5.71-1.477A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.65-.5-5.18-1.373l-.37-.214-3.838.991.997-3.74-.234-.386A9.94 9.94 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Share on WhatsApp
            </a>
          </div>
        ) : null}

        <div className="mt-6 flex justify-center gap-3">
          <Link href="/b2c/products" className="rounded-xl bg-muted border border-border px-6 py-3 text-sm font-bold text-foreground">
            Continue shopping
          </Link>
          <Link
            href="/account"
            className="rounded-xl bg-[#EF3752] px-6 py-3 text-sm font-bold text-white"
          >
            View my orders
          </Link>
        </div>
      </div>
    </div>
  );
}
