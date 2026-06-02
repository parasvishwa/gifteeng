import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";

interface ExportInput {
  canvasJson: Record<string, unknown>;
  width?: number;
  height?: number;
  format?: "png" | "pdf";
  productTitle?: string;
  quality?: number; // 1-100, default 95 for PNG
}

@Controller("customizer")
@UseGuards(JwtB2cGuard)
export class CanvasExportController {
  @Post("export")
  async export(@Body() body: ExportInput, @Res() res: Response) {
    const {
      canvasJson,
      width = 2400,
      height = 2400,
      format = "png",
      productTitle = "design",
      quality = 95,
    } = body;

    const slug = (productTitle ?? "design").replace(/[^a-z0-9]/gi, "-").toLowerCase();

    try {
      // ── Step 1: Render Fabric.js JSON → raw PNG buffer via node-canvas ──
      const { fabric } = require("fabric") as typeof import("fabric");
      const { createCanvas } = require("canvas") as typeof import("canvas");

      const nodeCanvas = createCanvas(width, height);
      const ctx = nodeCanvas.getContext("2d");

      const fabricCanvas = new (fabric as any).StaticCanvas(null, {
        width,
        height,
        renderOnAddRemove: false,
      });
      // Wire node-canvas context into Fabric's rendering pipeline
      (fabricCanvas as any).contextContainer = ctx;

      await new Promise<void>((resolve) => {
        fabricCanvas.loadFromJSON(canvasJson, () => {
          fabricCanvas.renderAll();
          resolve();
        });
      });

      const rawPng: Buffer = nodeCanvas.toBuffer("image/png");

      // ── Step 2: Post-process with sharp ────────────────────────────────
      const sharp = require("sharp") as typeof import("sharp");

      if (format === "pdf") {
        // ── PDF via pdf-lib ────────────────────────────────────────────
        // Embed the rendered PNG as a full-bleed page. pdf-lib produces
        // a clean, standards-compliant PDF — better for print shops than
        // pdfkit's stream-based approach.
        const { PDFDocument } = require("pdf-lib") as typeof import("pdf-lib");

        // Compress PNG with sharp before embedding (reduces PDF size ~40%)
        const compressedPng = await sharp(rawPng)
          .png({ quality, compressionLevel: 6 })
          .toBuffer();

        const pdfDoc = await PDFDocument.create();
        // A4 at 300dpi = 2480×3508, but honour caller's dimensions
        const page = pdfDoc.addPage([width, height]);
        const pngImage = await pdfDoc.embedPng(compressedPng);

        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width,
          height,
        });

        // Add bleed marks (3mm = ~34px at 300dpi)
        // Mark corners so print shops can see bleed boundaries
        const { rgb } = require("pdf-lib") as typeof import("pdf-lib");
        const bleed = Math.round(width * 0.014); // ~3mm at 300dpi
        const markLen = Math.round(width * 0.02);
        const markColor = rgb(0, 0, 0);
        const corners = [
          { x: bleed, y: bleed },              // bottom-left
          { x: width - bleed, y: bleed },       // bottom-right
          { x: bleed, y: height - bleed },      // top-left
          { x: width - bleed, y: height - bleed }, // top-right
        ];
        for (const c of corners) {
          page.drawLine({ start: { x: c.x - markLen, y: c.y }, end: { x: c.x + markLen, y: c.y }, thickness: 1, color: markColor, opacity: 0.5 });
          page.drawLine({ start: { x: c.x, y: c.y - markLen }, end: { x: c.x, y: c.y + markLen }, thickness: 1, color: markColor, opacity: 0.5 });
        }

        const pdfBytes = await pdfDoc.save();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${slug}-print.pdf"`);
        res.setHeader("Content-Length", pdfBytes.byteLength);
        res.end(Buffer.from(pdfBytes));
      } else {
        // ── PNG: run through sharp for quality/compression control ─────
        const pngBuffer = await sharp(rawPng)
          .png({ quality, compressionLevel: 6 })
          .toBuffer();

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Disposition", `attachment; filename="${slug}-print.png"`);
        res.setHeader("Content-Length", pngBuffer.byteLength);
        res.end(pngBuffer);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        error: "Export failed",
        message: msg,
        hint: "Ensure `canvas`, `sharp`, and `pdf-lib` npm packages are installed in the API.",
      });
    }
  }
}
