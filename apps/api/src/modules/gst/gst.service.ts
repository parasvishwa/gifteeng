import { Injectable, Logger } from "@nestjs/common";

// GSTIN format: 2 digits (state) + 5 alphas (PAN part 1) + 4 digits (PAN part 2)
// + 1 alpha (PAN part 3) + 1 alnum (entity code) + "Z" + 1 alnum (checksum)
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export interface GstLookupResult {
  ok: boolean;
  name?: string;
  address?: string;
  status?: string;
  reason?: string;
}

@Injectable()
export class GstService {
  private readonly logger = new Logger(GstService.name);

  /**
   * Look up a GSTIN and return the legal/trade name.
   *
   * Uses whichever provider is configured via env vars:
   *   GST_API_PROVIDER = "appyflow" | "gstincheck" | "masterindia"   (default: appyflow)
   *   GST_API_KEY      = your API key
   *
   * If no key is configured, returns ok:false with a reason so the UI
   * can fall back to manual entry.
   */
  async verifyGstin(gstin: string): Promise<GstLookupResult> {
    const g = (gstin || "").trim().toUpperCase();
    if (!GSTIN_RE.test(g)) {
      return { ok: false, reason: "Invalid GSTIN format" };
    }

    const provider = (process.env.GST_API_PROVIDER || "appyflow").toLowerCase();
    const key = process.env.GST_API_KEY;

    if (!key) {
      return { ok: false, reason: "GST verification not configured on server (set GST_API_KEY)" };
    }

    try {
      switch (provider) {
        case "appyflow":
          return await this.fromAppyflow(g, key);
        case "gstincheck":
          return await this.fromGstincheck(g, key);
        case "masterindia":
          return await this.fromMasterIndia(g, key);
        default:
          return { ok: false, reason: `Unknown GST provider: ${provider}` };
      }
    } catch (e) {
      this.logger.error(`GST lookup failed for ${g}: ${(e as Error).message}`);
      return { ok: false, reason: "Provider lookup failed" };
    }
  }

  // ── Provider: Appyflow ──────────────────────────────────────────────────
  // https://appyflow.in/api/verifyGST
  private async fromAppyflow(gstin: string, key: string): Promise<GstLookupResult> {
    const url = `https://appyflow.in/api/verifyGST?gstNo=${encodeURIComponent(gstin)}&key_secret=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: `Provider HTTP ${res.status}` };
    const data = (await res.json()) as {
      error?: boolean;
      message?: string;
      taxpayerInfo?: { tradeNam?: string; lgnm?: string; gstin?: string; pradr?: { adr?: string } };
    };
    if (data.error || !data.taxpayerInfo) {
      return { ok: false, reason: data.message || "GSTIN not found" };
    }
    // Detect Appyflow sandbox / free-tier dummy response — the GSTIN echoed back
    // by the API will NOT match what we asked for, and/or the message mentions
    // "Free credits" / "paid credits". In sandbox mode the name is always fake.
    const msg = (data.message || "").toLowerCase();
    const echoedGstin = data.taxpayerInfo.gstin?.toUpperCase();
    const askedGstin = gstin.toUpperCase();
    const isSandbox = msg.includes("free credits") || msg.includes("paid credits") ||
                      (echoedGstin && echoedGstin !== askedGstin);
    if (isSandbox) {
      return {
        ok: false,
        reason: "Appyflow is on sandbox / free-tier — buy paid credits at https://dashboard.gstapi.appyflow.in to get real lookups",
      };
    }
    const info = data.taxpayerInfo;
    return {
      ok: true,
      name: info.tradeNam || info.lgnm || "",
      address: info.pradr?.adr,
    };
  }

  // ── Provider: sheet.gstincheck.co.in ────────────────────────────────────
  private async fromGstincheck(gstin: string, key: string): Promise<GstLookupResult> {
    const url = `https://sheet.gstincheck.co.in/check/${encodeURIComponent(key)}/${encodeURIComponent(gstin)}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: `Provider HTTP ${res.status}` };
    const data = (await res.json()) as {
      flag?: boolean;
      data?: { lgnm?: string; tradeNam?: string; pradr?: { adr?: string }; sts?: string };
    };
    if (!data.flag || !data.data) return { ok: false, reason: "GSTIN not found" };
    return {
      ok: true,
      name: data.data.tradeNam || data.data.lgnm || "",
      address: data.data.pradr?.adr,
      status: data.data.sts,
    };
  }

  // ── Provider: Master India ──────────────────────────────────────────────
  // https://docs.mastergst.com/
  private async fromMasterIndia(gstin: string, key: string): Promise<GstLookupResult> {
    const url = `https://commonapi.mastergst.com/commonapis/searchgstin?gstin=${encodeURIComponent(gstin)}`;
    const res = await fetch(url, {
      headers: {
        "client_id": process.env.GST_API_CLIENT_ID || "",
        "client_secret": key,
      },
    });
    if (!res.ok) return { ok: false, reason: `Provider HTTP ${res.status}` };
    const data = (await res.json()) as {
      data?: { lgnm?: string; tradeNam?: string; pradr?: { adr?: string }; sts?: string };
      status_cd?: string;
      error?: { message?: string };
    };
    if (data.status_cd !== "1" || !data.data) return { ok: false, reason: data.error?.message || "GSTIN not found" };
    return {
      ok: true,
      name: data.data.tradeNam || data.data.lgnm || "",
      address: data.data.pradr?.adr,
      status: data.data.sts,
    };
  }
}
