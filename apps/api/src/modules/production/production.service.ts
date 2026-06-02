import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { PrismaService } from "../../prisma/prisma.service";

// Lazy-require canvas so the module still loads if native bindings are absent
// (the endpoint will return a 500 with a clear message in that case).
function loadCanvas() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("canvas");
  } catch {
    return null;
  }
}

const RENDERS_DIR = process.env.RENDERS_DIR ?? "/srv/gifteeng/uploads/renders";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

type FabricObject = {
  type: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  src?: string;
  // text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  fill?: string;
  textAlign?: string;
  // rect
  rx?: number;
  ry?: number;
  stroke?: string;
  strokeWidth?: number;
};

type FabricJson = {
  version?: string;
  width?: number;
  height?: number;
  background?: string;
  objects?: FabricObject[];
};

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async renderOrderItem(
    orderId: string,
    itemIndex: number,
  ): Promise<{ url: string }> {
    const canvas = loadCanvas();
    if (!canvas) {
      throw new InternalServerErrorException(
        "node-canvas native bindings not available. " +
          "Run: apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && pnpm install",
      );
    }

    // ── Fetch order + items ────────────────────────────────────────────────
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const items = order.items ?? [];
    if (itemIndex >= items.length) {
      throw new NotFoundException(
        `Item index ${itemIndex} out of range (order has ${items.length} items)`,
      );
    }

    const item = items[itemIndex]!;
    const customization = item.customization as FabricJson | null;

    if (!customization) {
      throw new NotFoundException(
        `Order item at index ${itemIndex} has no customization data`,
      );
    }

    const canvasWidth = customization.width ?? 1200;
    const canvasHeight = customization.height ?? 1200;

    // ── Create canvas ──────────────────────────────────────────────────────
    const { createCanvas, loadImage } = canvas;
    const cnv = createCanvas(canvasWidth, canvasHeight);
    const ctx = cnv.getContext("2d");

    // Background
    if (customization.background) {
      ctx.fillStyle = customization.background;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // ── Draw objects ───────────────────────────────────────────────────────
    for (const obj of customization.objects ?? []) {
      const left = obj.left ?? 0;
      const top = obj.top ?? 0;
      const w = (obj.width ?? 100) * (obj.scaleX ?? 1);
      const h = (obj.height ?? 100) * (obj.scaleY ?? 1);
      const angle = ((obj.angle ?? 0) * Math.PI) / 180;
      const opacity = obj.opacity ?? 1;

      ctx.save();
      ctx.globalAlpha = opacity;

      // Translate to center of object, rotate, translate back
      ctx.translate(left + w / 2, top + h / 2);
      if (angle) ctx.rotate(angle);
      ctx.translate(-w / 2, -h / 2);

      const type = (obj.type ?? "").toLowerCase();

      if (type === "image" && obj.src) {
        try {
          let imgSrc = obj.src;
          // Handle data URLs directly; remote URLs fetched as buffer
          let imgObj: unknown;
          if (imgSrc.startsWith("data:")) {
            imgObj = await loadImage(imgSrc);
          } else {
            const buf = await fetchBuffer(imgSrc);
            imgObj = await loadImage(buf);
          }
          ctx.drawImage(imgObj as any, 0, 0, w, h);
        } catch (err) {
          this.logger.warn(`Failed to load image ${obj.src}: ${err}`);
        }
      } else if (type === "textbox" || type === "i-text" || type === "text") {
        const fontSize = obj.fontSize ?? 24;
        const fontFamily = obj.fontFamily ?? "sans-serif";
        const fontWeight = obj.fontWeight ?? "normal";
        const fontStyle = obj.fontStyle ?? "normal";
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}"`;
        ctx.fillStyle = obj.fill ?? "#000000";
        ctx.textAlign = (obj.textAlign as string ?? "left") as "left" | "right" | "center" | "start" | "end";
        const lines = (obj.text ?? "").split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, 0, fontSize + i * fontSize * 1.2);
        });
      } else if (type === "rect") {
        ctx.fillStyle = obj.fill ?? "transparent";
        if (obj.stroke && obj.strokeWidth) {
          ctx.strokeStyle = obj.stroke;
          ctx.lineWidth = obj.strokeWidth;
        }
        if (obj.rx || obj.ry) {
          const rx = obj.rx ?? 0;
          const ry = obj.ry ?? rx;
          ctx.beginPath();
          ctx.moveTo(rx, 0);
          ctx.lineTo(w - rx, 0);
          ctx.quadraticCurveTo(w, 0, w, ry);
          ctx.lineTo(w, h - ry);
          ctx.quadraticCurveTo(w, h, w - rx, h);
          ctx.lineTo(rx, h);
          ctx.quadraticCurveTo(0, h, 0, h - ry);
          ctx.lineTo(0, ry);
          ctx.quadraticCurveTo(0, 0, rx, 0);
          ctx.closePath();
          if (obj.fill && obj.fill !== "transparent") ctx.fill();
          if (obj.stroke) ctx.stroke();
        } else {
          if (obj.fill && obj.fill !== "transparent") ctx.fillRect(0, 0, w, h);
          if (obj.stroke) ctx.strokeRect(0, 0, w, h);
        }
      }

      ctx.restore();
    }

    // ── Save PNG ───────────────────────────────────────────────────────────
    ensureDir(RENDERS_DIR);
    const filename = `${orderId}-${itemIndex}.png`;
    const filepath = path.join(RENDERS_DIR, filename);

    const pngBuffer: Buffer = cnv.toBuffer("image/png");
    fs.writeFileSync(filepath, pngBuffer);

    const baseUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const url = `${baseUrl}/uploads/renders/${filename}`;

    this.logger.log(`Rendered ${filepath} (${pngBuffer.length} bytes) → ${url}`);
    return { url };
  }
}
