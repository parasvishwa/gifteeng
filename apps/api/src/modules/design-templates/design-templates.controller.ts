import {
  Body, Controller, Delete, Get, Param, Patch,
  Post, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DesignTemplatesService } from "./design-templates.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("design-templates")
@Controller("design-templates")
export class DesignTemplatesController {
  constructor(private readonly svc: DesignTemplatesService) {}

  /** Public-ish: B2C customizer reads active templates */
  @Get()
  list(
    @Query("category") category?: string,
    @Query("active") active?: string,
  ) {
    return this.svc.list({
      category,
      active: active !== undefined ? active !== "false" : undefined,
    });
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.svc.getById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post()
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  /** Seeds 10 built-in starter templates (idempotent) */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("seed-presets")
  seedPresets() {
    return this.svc.seedPresets(PRESET_TEMPLATES);
  }
}

// ── 10 Built-in Starter Templates ───────────────────────────────────────────

function makeCanvas(bg: string, title: string, titleColor: string, accentColor: string, photoAreaColor: string) {
  return {
    version: "5.3.0",
    background: bg,
    objects: [
      {
        type: "rect", originX: "left", originY: "top",
        left: 0, top: 0, width: 500, height: 500,
        fill: bg, selectable: false, evented: false,
        lockMovementX: true, lockMovementY: true,
      },
      {
        type: "textbox", originX: "left", originY: "top",
        left: 30, top: 30, width: 440, height: 70,
        text: title,
        fontSize: 34, fontWeight: "bold", fontFamily: "Georgia, serif",
        fill: titleColor, textAlign: "center",
      },
      {
        type: "rect", originX: "left", originY: "top",
        left: 100, top: 120, width: 300, height: 220,
        fill: photoAreaColor, stroke: accentColor,
        strokeWidth: 2, strokeDashArray: [8, 5],
        rx: 12, ry: 12, selectable: true,
      },
      {
        type: "textbox", originX: "left", originY: "top",
        left: 100, top: 215, width: 300, height: 30,
        text: "📷  Drop Your Photo Here",
        fontSize: 13, fontFamily: "Arial, sans-serif",
        fill: accentColor, textAlign: "center",
      },
      {
        type: "textbox", originX: "left", originY: "top",
        left: 50, top: 370, width: 400, height: 50,
        text: "Your Name",
        fontSize: 22, fontWeight: "bold", fontFamily: "Georgia, serif",
        fill: titleColor, textAlign: "center",
      },
      {
        type: "textbox", originX: "left", originY: "top",
        left: 50, top: 430, width: 400, height: 40,
        text: "Your personalised message here…",
        fontSize: 13, fontFamily: "Arial, sans-serif",
        fill: accentColor, textAlign: "center", fontStyle: "italic",
      },
    ],
  };
}

const PRESET_TEMPLATES = [
  {
    label: "Birthday Bliss",
    category: "Birthday",
    sort_order: 0,
    canvas_json: makeCanvas("#FFF0F7", "🎂  Happy Birthday!", "#C41E8A", "#E8609A", "#FFE4F2"),
  },
  {
    label: "Anniversary Gold",
    category: "Anniversary",
    sort_order: 1,
    canvas_json: makeCanvas("#FFFBF0", "💛  Happy Anniversary!", "#8B6914", "#C9950A", "#FFF3CC"),
  },
  {
    label: "Thank You Warmth",
    category: "Thank You",
    sort_order: 2,
    canvas_json: makeCanvas("#FFF7F0", "🙏  Thank You!", "#C44A1E", "#E8742A", "#FFE8D6"),
  },
  {
    label: "Wedding Elegance",
    category: "Wedding",
    sort_order: 3,
    canvas_json: makeCanvas("#FAFAF8", "💍  Congratulations!", "#6B5B47", "#9A8068", "#F5F0EA"),
  },
  {
    label: "Baby Shower Joy",
    category: "Baby",
    sort_order: 4,
    canvas_json: makeCanvas("#F0FBF8", "👶  It's a Baby!", "#1E7A63", "#2DAA8B", "#D8F5EE"),
  },
  {
    label: "Diwali Festival",
    category: "Festival",
    sort_order: 5,
    canvas_json: makeCanvas("#1A0A00", "🪔  Happy Diwali!", "#FFD700", "#FFA500", "#2D1500"),
  },
  {
    label: "Corporate Premium",
    category: "Corporate",
    sort_order: 6,
    canvas_json: makeCanvas("#F4F6FB", "🏆  Achievement Unlocked", "#1A2B5F", "#3A5BAF", "#E8EDF8"),
  },
  {
    label: "Love & Romance",
    category: "Love",
    sort_order: 7,
    canvas_json: makeCanvas("#FFF0F2", "❤️  With Love", "#A81030", "#D42050", "#FFD8E0"),
  },
  {
    label: "Graduation Pride",
    category: "Graduation",
    sort_order: 8,
    canvas_json: makeCanvas("#F8F0FF", "🎓  Congratulations, Graduate!", "#5A1F8C", "#8B45C8", "#EDD8FF"),
  },
  {
    label: "Get Well Soon",
    category: "Get Well",
    sort_order: 9,
    canvas_json: makeCanvas("#F0FAF0", "🌻  Get Well Soon!", "#1E7A1E", "#2DAA2D", "#D8F5D8"),
  },
];
