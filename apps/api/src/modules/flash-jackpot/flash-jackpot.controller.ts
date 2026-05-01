import { Controller, Get, Post, Req, UseGuards, DefaultValuePipe, ParseIntPipe, Query } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { FlashJackpotService } from "./flash-jackpot.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";

@ApiTags("flash-jackpot")
@Controller("flash-jackpot")
export class FlashJackpotController {
  constructor(private service: FlashJackpotService) {}

  /** GET /api/flash-jackpot/state — hour state + (is user the current winner?) */
  @Get("state")
  state(@Req() req: any) {
    return this.service.getCurrentState(req.user?.customerId ?? null);
  }

  /** GET /api/flash-jackpot/feed — latest N winners */
  @Get("feed")
  feed(@Query("limit", new DefaultValuePipe(5), ParseIntPipe) limit: number) {
    return this.service.getLatestWinners(limit);
  }

  /** POST /api/flash-jackpot/roll — attempt to win this hour */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("roll")
  roll(@Req() req: any) {
    return this.service.roll(req.user.customerId as string);
  }
}
