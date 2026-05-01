import { Controller, Get, Query } from "@nestjs/common";
import { GstService, GstLookupResult } from "./gst.service";

@Controller("gst")
export class GstController {
  constructor(private readonly gstService: GstService) {}

  /**
   * GET /api/gst/verify?gstin=27ABCDE1234F1Z5
   *
   * Returns { ok: true, name, address? } on success,
   *         { ok: false, reason } otherwise.
   *
   * Never throws an HTTP error — the frontend always gets a 200 with
   * a structured result so it can gracefully fall back to manual entry.
   */
  @Get("verify")
  async verify(@Query("gstin") gstin?: string): Promise<GstLookupResult> {
    if (!gstin) return { ok: false, reason: "Missing gstin query param" };
    return this.gstService.verifyGstin(gstin);
  }
}
