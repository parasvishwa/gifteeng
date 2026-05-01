import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService) {}
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  async sendEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM ?? "Gifteeng <no-reply@gifteeng.com>",
        to,
        subject,
        html,
      });
    } catch (err) {
      this.log.error(`Failed to send email to ${to}`, err as Error);
    }
  }

  async record(
    channel: string,
    recipient: string,
    subject: string | undefined,
    body: string,
    payload?: unknown,
  ) {
    return this.prisma.notification.create({
      data: {
        channel,
        recipient,
        subject,
        body,
        status: "queued",
        payload: payload !== undefined ? (payload as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async listInbox(opts: {
    recipient?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, opts.pageSize ?? 20);
    const where: Prisma.NotificationWhereInput = {};
    if (opts.recipient) where.recipient = opts.recipient;
    if (opts.status) where.status = opts.status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { status: "read" } });
  }

  /** MSG91 OTP SMS. Minimal implementation — expand with template IDs etc. */
  async sendSms(phone: string, message: string) {
    const key = process.env.MSG91_AUTH_KEY;
    if (!key) {
      this.log.warn(`[DEV] SMS to ${phone}: ${message}`);
      return;
    }
    const url = `https://api.msg91.com/api/v5/flow/`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: key },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID,
        sender: process.env.MSG91_SENDER_ID,
        mobiles: phone,
        message,
      }),
    });
  }

  /**
   * Sends a login OTP via MSG91's dedicated OTP API (/api/v5/otp).
   * MSG91_OTP_TEMPLATE_ID is the ID from MSG91 → OTP → Templates (not an SMS Flow ID).
   * Passes a pre-generated OTP (we control OTP generation/hashing in AuthB2cService).
   * Silently falls back to a dev log if MSG91 is not configured.
   * Never throws — a failed SMS must never block the login flow.
   */
  async sendLoginOtp(phone: string, code: string): Promise<void> {
    const key = process.env.MSG91_AUTH_KEY;
    const tpl = process.env.MSG91_OTP_TEMPLATE_ID;
    if (!key || !tpl) {
      this.log.warn(`[DEV] OTP for ${phone}: ${code}`);
      return;
    }
    try {
      const digits = phone.replace(/\D/g, "");
      const mobile = digits.startsWith("91") ? digits : `91${digits}`;
      const url =
        `https://control.msg91.com/api/v5/otp` +
        `?template_id=${encodeURIComponent(tpl)}` +
        `&mobile=${encodeURIComponent(mobile)}` +
        `&otp=${encodeURIComponent(code)}` +
        `&otp_expiry=10`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: key },
      });
      const body = await resp.text().catch(() => "");
      if (!resp.ok) {
        this.log.error(`MSG91 OTP HTTP ${resp.status}: ${body.slice(0, 500)}`);
      } else {
        this.log.log(`MSG91 OTP sent to ${mobile}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      this.log.error("OTP SMS failed (non-fatal)", err as Error);
    }
  }

  /**
   * Sends an order confirmation SMS via MSG91 Flow API.
   * Silently skips if MSG91_AUTH_KEY is not configured.
   * Never throws — notification failure must never break the order flow.
   */
  async sendOrderConfirmationSms(
    phone: string,
    orderNumber: string,
    total: number,
  ): Promise<void> {
    const key = process.env.MSG91_AUTH_KEY;
    if (!key) {
      this.log.log("SMS skipped — MSG91 not configured");
      return;
    }
    try {
      const normalised = phone.replace(/\D/g, "");
      const mobile = normalised.startsWith("91") ? normalised : `91${normalised}`;
      await fetch("https://api.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: key },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID,
          short_url: "0",
          mobiles: mobile,
          var1: orderNumber,
          var2: String(total),
        }),
      });
    } catch (err) {
      this.log.error("Order confirmation SMS failed (non-fatal)", err as Error);
    }
  }

  /**
   * Returns a WhatsApp click-to-chat URL pre-filled with an order confirmation message.
   */
  getWhatsAppUrl(phone: string, orderNumber: string, total: number): string {
    const normalised = phone.replace(/\D/g, "");
    const mobile = normalised.startsWith("91") ? normalised : `91${normalised}`;
    const text = encodeURIComponent(
      `Your Gifteeng order #${orderNumber} of ₹${total} is confirmed! We'll deliver within 5-7 days. Thank you 🎁`,
    );
    return `https://wa.me/${mobile}?text=${text}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Push notifications (FCM)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Uses FCM HTTP V1 API (legacy FCM server-key is deprecated). Needs a
  // service-account JSON in env FIREBASE_SERVICE_ACCOUNT_JSON. The JWT is
  // minted here with Node's native crypto — no new npm dependency.
  //
  // If the env var is missing (dev / not-yet-configured), send is a no-op
  // that logs — the feature layer stays intact and flips on the moment
  // credentials are dropped in.

  async registerDeviceToken(customerId: string, data: {
    token:      string;
    platform:   string;
    appVersion?: string;
    deviceName?: string;
  }) {
    if (!data.token) return { ok: false };
    // upsert by token — if the same token was seen under a different
    // customer (shared device), transfer ownership.
    await this.prisma.deviceToken.upsert({
      where: { token: data.token },
      create: {
        customerId,
        token:      data.token,
        platform:   data.platform,
        appVersion: data.appVersion ?? null,
        deviceName: data.deviceName ?? null,
      },
      update: {
        customerId,
        platform:   data.platform,
        appVersion: data.appVersion ?? null,
        deviceName: data.deviceName ?? null,
        lastSeenAt: new Date(),
      },
    });
    return { ok: true };
  }

  async unregisterDeviceToken(customerId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { customerId, token },
    });
    return { ok: true };
  }

  /**
   * Send a push notification to every registered device of a customer.
   * `data` is a string-string map (FCM requirement) used for deep-linking.
   *
   * Returns { sent, failed } counts. Invalid tokens are auto-removed.
   */
  async sendToCustomer(customerId: string, payload: {
    title: string;
    body:  string;
    data?: Record<string, string>;
  }): Promise<{ sent: number; failed: number }> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { customerId },
      select: { id: true, token: true, platform: true },
    });
    if (tokens.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    for (const t of tokens) {
      const ok = await this.fcmSend(t.token, payload);
      if (ok === true)      sent++;
      else if (ok === false) failed++;
      else {
        // null → token invalid / not-registered, remove it
        failed++;
        try {
          await this.prisma.deviceToken.delete({ where: { id: t.id } });
        } catch (_) {}
      }
    }
    // Persist an inbox entry so users see the push in the app even if the
    // OS delivery was missed.
    await this.record("push", customerId, payload.title, payload.body, payload.data ?? null);
    return { sent, failed };
  }

  /**
   * Convenience — used by orders module on status transitions.
   * Maps a 'shipped' | 'delivered' | 'cancelled' status to a nice payload.
   */
  async sendOrderStatusUpdate(customerId: string, opts: {
    orderNumber: string;
    status:      string;           // "confirmed" | "shipped" | "out_for_delivery" | "delivered" | "cancelled"
    trackingUrl?: string;
  }): Promise<void> {
    const label = ORDER_STATUS_LABEL[opts.status] ?? opts.status;
    await this.sendToCustomer(customerId, {
      title: `Order #${opts.orderNumber}`,
      body:  label,
      data: {
        route:    `/orders/${opts.orderNumber}`,
        type:     "order_status",
        status:   opts.status,
        orderNumber: opts.orderNumber,
        ...(opts.trackingUrl ? { trackingUrl: opts.trackingUrl } : {}),
      },
    });
  }

  /**
   * Admin broadcast — send a push to every registered device.
   * Heavy hammer; only super_admin controller route should call this.
   */
  async broadcast(payload: {
    title: string;
    body:  string;
    data?: Record<string, string>;
    platform?: string;                // optional filter
  }): Promise<{ sent: number; failed: number; targets: number }> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: payload.platform ? { platform: payload.platform } : {},
      select: { id: true, token: true },
    });
    let sent = 0;
    let failed = 0;
    for (const t of tokens) {
      const ok = await this.fcmSend(t.token, payload);
      if (ok === true) sent++;
      else if (ok === false) failed++;
      else {
        failed++;
        try { await this.prisma.deviceToken.delete({ where: { id: t.id } }); } catch (_) {}
      }
    }
    return { sent, failed, targets: tokens.length };
  }

  // ─── Internals ────────────────────────────────────────────────────────

  /**
   * Returns true  — delivered
   *         false — transient failure (network, 5xx)
   *         null  — token permanently invalid (remove it)
   */
  private async fcmSend(
    token: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<true | false | null> {
    const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!svcJson) {
      this.log.warn(`[DEV] push skipped — FIREBASE_SERVICE_ACCOUNT_JSON not set. Would send: ${payload.title}`);
      return false;
    }
    let svc: { project_id: string; client_email: string; private_key: string };
    try {
      svc = JSON.parse(svcJson);
    } catch {
      this.log.error("FIREBASE_SERVICE_ACCOUNT_JSON is malformed — push disabled");
      return false;
    }

    let accessToken: string;
    try {
      accessToken = await this.getFcmAccessToken(svc);
    } catch (err) {
      this.log.error("FCM OAuth token failed", err as Error);
      return false;
    }

    const url = `https://fcm.googleapis.com/v1/projects/${svc.project_id}/messages:send`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data:         payload.data ?? {},
            android: { priority: "high" },
            apns: {
              payload: { aps: { sound: "default" } },
            },
          },
        }),
      });
      if (resp.ok) return true;
      const bodyText = await resp.text().catch(() => "");
      // Token-gone signals from FCM → remove token on our side
      if (
        resp.status === 404 ||
        bodyText.includes("UNREGISTERED") ||
        bodyText.includes("registration-token-not-registered") ||
        bodyText.includes("NOT_FOUND")
      ) {
        this.log.warn(`FCM token invalid, removing: ${bodyText.slice(0, 200)}`);
        return null;
      }
      this.log.error(`FCM HTTP ${resp.status}: ${bodyText.slice(0, 400)}`);
      return false;
    } catch (err) {
      this.log.error("FCM send failed", err as Error);
      return false;
    }
  }

  private _fcmTokenCache: { token: string; expiresAt: number } | null = null;

  /** Cache the short-lived OAuth token (FCM gives ~1 hour TTL). */
  private async getFcmAccessToken(svc: {
    client_email: string;
    private_key:  string;
  }): Promise<string> {
    if (this._fcmTokenCache && this._fcmTokenCache.expiresAt > Date.now() + 60_000) {
      return this._fcmTokenCache.token;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claim = {
      iss:   svc.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud:   "https://oauth2.googleapis.com/token",
      exp:   now + 3600,
      iat:   now,
    };
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc(header)}.${enc(claim)}`;
    const crypto = await import("node:crypto");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsigned);
    const sig = signer.sign(svc.private_key).toString("base64url");
    const jwt = `${unsigned}.${sig}`;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" +
        `&assertion=${encodeURIComponent(jwt)}`,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`OAuth token endpoint ${resp.status}: ${t.slice(0, 300)}`);
    }
    const data: any = await resp.json();
    const token = data.access_token as string;
    const ttl   = (data.expires_in as number) ?? 3500;
    this._fcmTokenCache = { token, expiresAt: Date.now() + ttl * 1000 };
    return token;
  }
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  confirmed:        "Your order is confirmed 🎁",
  shipped:          "Your gift is on its way! 📦",
  out_for_delivery: "Out for delivery — arriving today 🚚",
  delivered:        "Delivered! Enjoy your Gifteeng order 💝",
  cancelled:        "Order cancelled — refund will reflect in 3–5 days",
};
