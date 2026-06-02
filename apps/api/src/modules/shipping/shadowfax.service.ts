import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";

/**
 * Shadowfax Unified API client (dale.shadowfax.in).
 *
 * Auth: header `Authorization: Token <SHADOWFAX_TOKEN>` (NOT "Bearer").
 * Base URLs (per Shadowfax merchant docs):
 *   • Production : https://dale.shadowfax.in/api/
 *   • Staging    : https://dale.staging.shadowfax.in/api/
 *
 * Endpoints covered:
 *   • GET  /v1/clients/serviceability/        — check pincode serviceability
 *   • POST /v3/clients/generate_marketplace_awb/ — reserve AWB numbers
 *   • POST /v3/clients/orders/                — create forward order
 *   • GET  /v4/clients/orders/{awb}/track/    — single-order tracking
 *   • POST /v4/clients/bulk_track/            — bulk tracking (≤50 AWBs)
 *   • POST /v3/clients/order_update/          — update order
 *
 * Token lives in SHADOWFAX_TOKEN env var. Never hard-code. The Flutter app
 * and the public web NEVER call Shadowfax directly — they proxy through
 * this service so the token stays server-side.
 *
 * Env vars consumed:
 *   SHADOWFAX_TOKEN          — production token from merchant portal
 *   SHADOWFAX_BASE_URL       — override (defaults to prod)
 *   SHADOWFAX_PICKUP_PINCODE — our warehouse pincode (default 400101)
 *   SHADOWFAX_WEBHOOK_TOKEN  — shared token for inbound webhook auth
 */
@Injectable()
export class ShadowfaxService {
  private readonly log = new Logger(ShadowfaxService.name);

  private get baseUrl(): string {
    return (
      process.env.SHADOWFAX_BASE_URL ?? "https://dale.shadowfax.in/api"
    ).replace(/\/+$/, "");
  }

  private get token(): string {
    const t = process.env.SHADOWFAX_TOKEN;
    if (!t) {
      throw new HttpException(
        "SHADOWFAX_TOKEN not configured on the server",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return t;
  }

  private async req<T = unknown>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        // Shadowfax uses "Token <value>", not "Bearer".
        Authorization: `Token ${this.token}`,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      this.log.error(`Shadowfax ${method} ${path} → ${res.status}: ${text}`);
      throw new HttpException(
        { source: "shadowfax", status: res.status, body: json },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return json as T;
  }

  // ── Serviceability ────────────────────────────────────────────────────────

  /**
   * GET /v1/clients/serviceability/?service=<svc>&pincodes=<csv>
   *
   * @param pincodes  comma-separated drop pincodes (one or many)
   * @param service   one of: seller_pickup, customer_delivery, customer_pickup,
   *                  seller_delivery, warehouse_pickup, warehouse_return.
   *                  Defaults to `seller_delivery` (our standard outbound).
   */
  async serviceability(pincodes: string, service = "seller_delivery") {
    const qs = new URLSearchParams({ service, pincodes });
    return this.req(
      "GET",
      `/v1/clients/serviceability/?${qs.toString()}`,
    );
  }

  // ── AWB generation (reserve waybill numbers) ──────────────────────────────

  async generateAwbNumbers(count = 1) {
    return this.req<{
      message: string;
      awb_numbers: string[];
    }>("POST", "/v3/clients/generate_marketplace_awb/", { count });
  }

  // ── Forward order creation ────────────────────────────────────────────────

  /**
   * Create a forward shipment. `payload` shape per Shadowfax docs — see
   * createOrderForGifteeng() below for the typed helper most callers want.
   */
  async createOrder(payload: ShadowfaxOrderPayload) {
    return this.req<ShadowfaxOrderResponse>(
      "POST",
      "/v3/clients/orders/",
      payload,
    );
  }

  /**
   * Convenience helper that builds the Shadowfax payload from our internal
   * Order model. Defaults `order_type` to "marketplace" because Gifteeng
   * runs a curated marketplace (multiple sellers, single fulfillment).
   * Override to "warehouse" when shipping from our own warehouse only.
   */
  async createOrderForGifteeng(input: {
    orderType?: "marketplace" | "warehouse";
    clientOrderId: string;
    awbNumber?: string; // optional — generate one if not provided
    actualWeightKg: number;
    volumetricWeightKg?: number;
    productValue: number;
    paymentMode: "Prepaid" | "COD";
    codAmount?: number;
    promisedDeliveryDate?: string; // YYYY-MM-DD
    totalAmount: number;
    customer: ShadowfaxParty;
    pickup: ShadowfaxParty;
    rts: ShadowfaxParty;
    products: ShadowfaxProduct[];
  }) {
    const orderType = input.orderType ?? "marketplace";
    const payload: ShadowfaxOrderPayload = {
      order_type: orderType,
      order_details: {
        client_order_id: input.clientOrderId,
        ...(input.awbNumber ? { awb_number: input.awbNumber } : {}),
        actual_weight: input.actualWeightKg,
        volumetric_weight: input.volumetricWeightKg ?? input.actualWeightKg,
        product_value: input.productValue,
        payment_mode: input.paymentMode,
        cod_amount: input.codAmount ?? 0,
        ...(input.promisedDeliveryDate
          ? { promised_delivery_date: input.promisedDeliveryDate }
          : {}),
        total_amount: input.totalAmount,
        order_service: "regular",
      },
      customer_details: input.customer,
      pickup_details: input.pickup,
      // Shadowfax uses `rts_details` for marketplace, `rto_details` for warehouse.
      ...(orderType === "marketplace"
        ? { rts_details: input.rts }
        : { rto_details: input.rts }),
      product_details: input.products,
    };
    return this.createOrder(payload);
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  async track(awb: string) {
    return this.req<ShadowfaxTrackResponse>(
      "GET",
      `/v4/clients/orders/${encodeURIComponent(awb)}/track/`,
    );
  }

  /** Bulk track up to 50 AWBs in one call. */
  async bulkTrack(awbs: string[]) {
    if (awbs.length === 0 || awbs.length > 50) {
      throw new HttpException(
        "bulkTrack accepts 1-50 AWBs",
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.req("POST", "/v4/clients/bulk_track/", { awb_numbers: awbs });
  }

  // ── Update order ──────────────────────────────────────────────────────────

  async updateOrder(payload: Record<string, unknown>) {
    return this.req("POST", "/v3/clients/order_update/", payload);
  }

  // ── Webhook verification ──────────────────────────────────────────────────

  /**
   * Shadowfax echoes the token registered in the portal back as
   * `Authorization: Token <value>` (or plain `<value>` depending on the
   * "Authorisation Present" mode). We accept either form.
   */
  verifyWebhook(authHeader: string | undefined): boolean {
    const expected = process.env.SHADOWFAX_WEBHOOK_TOKEN;
    if (!expected) {
      this.log.warn(
        "SHADOWFAX_WEBHOOK_TOKEN not set — accepting webhook unverified",
      );
      return true;
    }
    if (!authHeader) return false;
    const value = authHeader.startsWith("Token ")
      ? authHeader.slice(6).trim()
      : authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : authHeader.trim();
    if (value.length !== expected.length) return false;
    let ok = 0;
    for (let i = 0; i < value.length; i++) {
      ok |= value.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return ok === 0;
  }
}

// ─── Types — derived from the Shadowfax Unified API docs ───────────────────

export interface ShadowfaxParty {
  name?: string;
  contact: string;            // 10-13 digits
  alternate_contact?: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: number;            // 6-digit
  latitude?: string;
  longitude?: string;
  email?: string;
  unique_code?: string;
  location_type?: "residential" | "Commercial";
}

export interface ShadowfaxProduct {
  hsn_code?: string;
  invoice_no?: string;
  sku_name: string;
  sku_id?: string;
  category?: string;
  price: number;
  seller_details?: {
    seller_name: string;
    seller_address: string;
    seller_state: string;
    gstin_number: string;
  };
  taxes?: {
    cgst?: number;
    sgst?: number;
    igst?: number;
    total_tax?: number;
  };
  additional_details?: {
    requires_extra_care?: boolean | string;
    type_extra_care?: string;
    quantity?: number;
  };
}

export interface ShadowfaxOrderPayload {
  order_type: "marketplace" | "warehouse";
  order_details: {
    client_order_id: string;
    awb_number?: string;
    actual_weight: number;
    volumetric_weight: number;
    product_value: number;
    payment_mode: "Prepaid" | "COD";
    cod_amount: number;
    promised_delivery_date?: string;
    total_amount: number;
    eway_bill?: string;
    gstin_number?: string;
    order_service?: "regular";
  };
  customer_details: ShadowfaxParty;
  pickup_details: ShadowfaxParty;
  rts_details?: ShadowfaxParty;
  rto_details?: ShadowfaxParty;
  product_details: ShadowfaxProduct[];
}

export interface ShadowfaxOrderResponse {
  message: "Success" | "Failure" | string;
  errors?: unknown;
  data?: {
    id: number;
    client_name: string;
    client_order_id: string;
    awb_number: string;
    product_value: number;
    cod_amount: number;
    payment_mode: string;
    order_date: string;
    promised_delivery_date: string | null;
    status_display: string;
    status: string;
    pickup_details: ShadowfaxParty;
    delivery_details: ShadowfaxParty;
    product_details: ShadowfaxProduct[];
  };
}

export interface ShadowfaxTrackEvent {
  created: string;     // ISO-8601
  location: string;
  status_id: string;
  status: string;
  remarks: string;
  awb_number: string;
}

export interface ShadowfaxTrackResponse {
  message: "Success" | string;
  order_details?: Record<string, unknown>;
  tracking_details?: ShadowfaxTrackEvent[];
}
