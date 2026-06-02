import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from "@nestjs/swagger";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { AiCustomizerService, type AiCustomizerInput } from "./ai-customizer.service";

class AiCustomizerDto implements AiCustomizerInput {
  /** ID of the product being customised */
  productId!: string;
  /** Optional free-text prompt from the user */
  prompt?: string;
  /** Occasion hint: birthday | anniversary | wedding | graduation | christmas | diwali | baby | corporate */
  occasion?: string;
  /** Recipient's name for personalisation copy in the prompt */
  recipientName?: string;
  /** Visual style hint: minimal | bold | elegant | playful | vintage | modern */
  style?: string;
}

/**
 * POST /customizer/ai
 *
 * Returns 3-4 structured design suggestions (prompt + seed) for the mobile
 * canvas engine. No image is generated here — the suggestions feed directly
 * into the Flutter ai_generate_sheet.dart which drives the canvas renderer.
 *
 * Guard: JwtB2cGuard — logged-in B2C customers only.
 *
 * TODO: Replace the deterministic heuristic suggestions in AiCustomizerService
 *       with a real AI SDK call (OpenAI images/generations or Gemini) once the
 *       API key and rate-limit strategy are confirmed.
 */
@ApiTags("customizer")
@ApiBearerAuth()
@Controller("customizer")
export class AiCustomizerController {
  constructor(private readonly service: AiCustomizerService) {}

  @Post("ai")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtB2cGuard)
  @ApiOperation({ summary: "Generate AI design suggestions for a customisable product" })
  @ApiBody({ type: AiCustomizerDto })
  generateSuggestions(@Body() body: AiCustomizerDto) {
    return this.service.generateSuggestions(body);
  }
}
