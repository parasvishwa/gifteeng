import { Injectable, Logger } from "@nestjs/common";

/**
 * Shiprocket integration. Ports B2C `shiprocket-ship` edge function.
 * Caches the Shiprocket token (valid ~10 days) and exposes create / track.
 */
@Injectable()
export class ShippingService {
  private readonly log = new Logger(ShippingService.name);
  private token: string | null = null;
  private tokenExpiresAt = 0;

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;
    if (!email || !password) throw new Error("Shiprocket credentials missing");

    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(`Shiprocket auth failed: ${JSON.stringify(json)}`);
    this.token = json.token;
    this.tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
    return this.token!;
  }

  async createOrder(payload: Record<string, unknown>) {
    const token = await this.getToken();
    const res = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async track(awb: string) {
    const token = await this.getToken();
    const res = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delivery-estimate (public) — fast O(1) lookup, no external API.
  //
  // The rules below map Indian pincode prefixes → zone + city + business-day
  // dispatch / delivery windows. Ordered most-specific first. If a pincode
  // doesn't match anything we fall back to a nation-wide default (7-day
  // delivery, no COD) and flag it as deliverable but slow.
  //
  // Add new zones / prefixes here — no DB migration required.
  // ─────────────────────────────────────────────────────────────────────────

  estimate(pincodeRaw: string): DeliveryEstimate {
    const pincode = (pincodeRaw || "").trim();
    if (!/^\d{6}$/.test(pincode)) {
      return {
        deliverable: false,
        pincode,
        message: "Please enter a valid 6-digit pincode",
      };
    }

    const match = PINCODE_RULES.find((r) => r.prefix.test(pincode));
    if (!match) {
      // Unknown pincode — still deliverable but conservative timing.
      const dispatchDate = addBusinessDays(new Date(), 3);
      const deliveryDate = addBusinessDays(dispatchDate, 7);
      return {
        deliverable: true,
        pincode,
        city: "India",
        zone: "Other",
        cod: false,
        dispatchInBusinessDays: 3,
        deliveryInBusinessDays: 7,
        dispatchDate: isoDate(dispatchDate),
        deliveryDate: isoDate(deliveryDate),
        etaLabel: `Arrives by ${formatShort(deliveryDate)}`,
        message: "Standard shipping to this pincode",
      };
    }

    const dispatchDate = addBusinessDays(new Date(), match.dispatchDays);
    const deliveryDate = addBusinessDays(dispatchDate, match.deliveryDays);

    return {
      deliverable: true,
      pincode,
      city: match.city,
      zone: match.zone,
      cod: match.cod,
      dispatchInBusinessDays: match.dispatchDays,
      deliveryInBusinessDays: match.deliveryDays,
      dispatchDate: isoDate(dispatchDate),
      deliveryDate: isoDate(deliveryDate),
      etaLabel: `Arrives by ${formatShort(deliveryDate)}`,
    };
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeliveryEstimate {
  deliverable: boolean;
  pincode: string;
  city?: string;
  zone?: string;
  cod?: boolean;
  dispatchInBusinessDays?: number;
  deliveryInBusinessDays?: number;
  dispatchDate?: string; // YYYY-MM-DD
  deliveryDate?: string; // YYYY-MM-DD
  etaLabel?: string;
  message?: string;
}

// ─── Pincode → city / timing matrix ──────────────────────────────────────────

interface PincodeRule {
  prefix: RegExp;
  city: string;
  zone: string;
  dispatchDays: number;
  deliveryDays: number;
  cod: boolean;
}

const PINCODE_RULES: PincodeRule[] = [
  // Mumbai metro
  { prefix: /^40[01]\d{3}$/, city: "Mumbai",     zone: "Maharashtra", dispatchDays: 2, deliveryDays: 2, cod: true  },
  // Pune / Pimpri-Chinchwad
  { prefix: /^41[12]\d{3}$/, city: "Pune",       zone: "Maharashtra", dispatchDays: 2, deliveryDays: 3, cod: true  },
  // Other Maharashtra
  { prefix: /^4\d{5}$/,      city: "Maharashtra",zone: "Maharashtra", dispatchDays: 2, deliveryDays: 4, cod: true  },

  // Delhi NCR (Delhi + Gurgaon/Gurugram + Noida)
  { prefix: /^110\d{3}$/,    city: "Delhi",      zone: "Delhi NCR",   dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^12[012]\d{3}$/,city: "Gurugram",   zone: "Delhi NCR",   dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^201\d{3}$/,    city: "Noida",      zone: "Delhi NCR",   dispatchDays: 2, deliveryDays: 3, cod: true  },

  // Karnataka — Bengaluru
  { prefix: /^56[01]\d{3}$/, city: "Bengaluru",  zone: "Karnataka",   dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^5[67]\d{4}$/,  city: "Karnataka",  zone: "Karnataka",   dispatchDays: 2, deliveryDays: 4, cod: true  },

  // Tamil Nadu — Chennai
  { prefix: /^60[01]\d{3}$/, city: "Chennai",    zone: "Tamil Nadu",  dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^6[012]\d{4}$/, city: "Tamil Nadu", zone: "Tamil Nadu",  dispatchDays: 2, deliveryDays: 4, cod: true  },

  // Telangana — Hyderabad
  { prefix: /^50[01]\d{3}$/, city: "Hyderabad",  zone: "Telangana",   dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^5[012]\d{4}$/, city: "Telangana",  zone: "Telangana",   dispatchDays: 2, deliveryDays: 4, cod: true  },

  // Kolkata
  { prefix: /^700\d{3}$/,    city: "Kolkata",    zone: "West Bengal", dispatchDays: 2, deliveryDays: 4, cod: true  },
  { prefix: /^7\d{5}$/,      city: "West Bengal",zone: "West Bengal", dispatchDays: 2, deliveryDays: 5, cod: true  },

  // Gujarat — Ahmedabad / Surat
  { prefix: /^380\d{3}$/,    city: "Ahmedabad",  zone: "Gujarat",     dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^395\d{3}$/,    city: "Surat",      zone: "Gujarat",     dispatchDays: 2, deliveryDays: 3, cod: true  },
  { prefix: /^3[89]\d{4}$/,  city: "Gujarat",    zone: "Gujarat",     dispatchDays: 2, deliveryDays: 4, cod: true  },

  // Rajasthan — Jaipur
  { prefix: /^302\d{3}$/,    city: "Jaipur",     zone: "Rajasthan",   dispatchDays: 2, deliveryDays: 4, cod: true  },
  { prefix: /^3[012]\d{4}$/, city: "Rajasthan",  zone: "Rajasthan",   dispatchDays: 2, deliveryDays: 5, cod: true  },

  // Uttar Pradesh (non-NCR)
  { prefix: /^2[012345]\d{4}$/, city: "Uttar Pradesh", zone: "North India", dispatchDays: 2, deliveryDays: 5, cod: true },

  // Kerala
  { prefix: /^68[0-6]\d{3}$/, city: "Kochi",     zone: "Kerala",      dispatchDays: 2, deliveryDays: 5, cod: true  },
  { prefix: /^6[89]\d{4}$/,   city: "Kerala",    zone: "Kerala",      dispatchDays: 2, deliveryDays: 5, cod: true  },

  // North-east (longer ETA, no COD)
  { prefix: /^7[89]\d{4}$/, city: "North East", zone: "North East",  dispatchDays: 3, deliveryDays: 9, cod: false },

  // Jammu & Kashmir, Ladakh
  { prefix: /^19\d{4}$/,    city: "J&K",        zone: "North India", dispatchDays: 3, deliveryDays: 9, cod: false },
];

// ─── Date helpers ────────────────────────────────────────────────────────────

function addBusinessDays(from: Date, n: number): Date {
  // Clone then walk forward, skipping Sundays (day 0). Saturdays count as
  // business days since most Indian courier hubs operate Mon–Sat.
  const d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++;
  }
  return d;
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatShort(d: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}
