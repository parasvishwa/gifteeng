import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

export interface UpsertInput {
  occasion:            string;
  recipientName?:      string | null;
  eventDate:           string | Date;
  recurring?:          boolean;
  notifyDaysBefore?:   number;
  budgetMin?:          number | null;
  budgetMax?:          number | null;
  preferredCategoryId?: string | null;
  productId?:          string | null;
  autoOrder?:          boolean;
  savedAddressId?:     string | null;
  note?:               string | null;
  active?:             boolean;
}

/**
 * Gift reminders — user-set occasions with optional auto-order.
 *
 * Sync model with mobile + web:
 *   - Customer UI writes via POST /gift-reminders / PATCH /gift-reminders/:id
 *   - Daily cron calls POST /admin/gift-reminders/run-daily to dispatch
 *     notifications (and, if configured, auto-orders).
 *
 * For recurring reminders, `eventDate` encodes the occasion's month+day.
 * The cron computes the NEXT upcoming occurrence relative to today.
 */
@Injectable()
export class GiftRemindersService {
  private readonly log = new Logger(GiftRemindersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── CRUD ───────────────────────────────────────────────────────────────

  async listMine(customerId: string) {
    const rows = await this.prisma.giftReminder.findMany({
      where: { customerId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(serialize);
  }

  async create(customerId: string, input: UpsertInput) {
    this.validate(input);
    const row = await this.prisma.giftReminder.create({
      data: {
        customerId,
        occasion:           input.occasion,
        recipientName:      input.recipientName ?? null,
        eventDate:          new Date(input.eventDate),
        recurring:          input.recurring ?? true,
        notifyDaysBefore:   clampInt(input.notifyDaysBefore ?? 7, 0, 60),
        budgetMin:          input.budgetMin ?? null,
        budgetMax:          input.budgetMax ?? null,
        preferredCategoryId: input.preferredCategoryId ?? null,
        productId:          input.productId ?? null,
        autoOrder:          input.autoOrder ?? false,
        savedAddressId:     input.savedAddressId ?? null,
        note:               input.note ?? null,
        active:             input.active ?? true,
      },
    });
    return serialize(row);
  }

  async update(customerId: string, id: string, input: Partial<UpsertInput>) {
    const existing = await this.prisma.giftReminder.findUnique({ where: { id } });
    if (!existing || existing.customerId !== customerId) {
      throw new NotFoundException("Reminder not found");
    }
    this.validate({ ...existing, ...input } as UpsertInput);

    const data: any = { ...input };
    if (data.eventDate) data.eventDate = new Date(data.eventDate);
    if (data.notifyDaysBefore !== undefined) {
      data.notifyDaysBefore = clampInt(data.notifyDaysBefore, 0, 60);
    }

    const row = await this.prisma.giftReminder.update({
      where: { id },
      data,
    });
    return serialize(row);
  }

  async remove(customerId: string, id: string) {
    const existing = await this.prisma.giftReminder.findUnique({ where: { id } });
    if (!existing || existing.customerId !== customerId) {
      throw new NotFoundException("Reminder not found");
    }
    await this.prisma.giftReminder.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Daily cron ──────────────────────────────────────────────────────────

  /**
   * Called by the daily cron. Scans every active reminder, computes days
   * until next occurrence, and sends a push when within `notifyDaysBefore`.
   * Dedups via `lastNotifiedAt` so repeated cron runs in the same day don't
   * double-notify.
   *
   * Returns { scanned, notified, autoOrdered }.
   */
  async runDaily(): Promise<{ scanned: number; notified: number; autoOrdered: number }> {
    const reminders = await this.prisma.giftReminder.findMany({
      where: { active: true },
    });

    const now = new Date();
    const today = startOfDay(now);

    let notified    = 0;
    let autoOrdered = 0;

    for (const r of reminders) {
      try {
        const next = nextOccurrence(r.eventDate, r.recurring, today);
        const daysUntil = Math.round((+next - +today) / 86_400_000);

        // Fire only when within the configured window.
        if (daysUntil < 0 || daysUntil > r.notifyDaysBefore) continue;

        // Dedup — don't re-notify for the same occurrence.
        const lastMs = r.lastNotifiedAt ? +r.lastNotifiedAt : 0;
        if (lastMs > 0) {
          const daysSinceLast = (Date.now() - lastMs) / 86_400_000;
          // For recurring yearly reminders, 24h dedup is enough.
          // For one-shot reminders (recurring=false), never re-notify once sent.
          if (!r.recurring) continue;
          if (daysSinceLast < 0.8) continue;
        }

        const label = buildOccasionLabel(r.occasion, r.recipientName, daysUntil);
        await this.notifications.sendToCustomer(r.customerId, {
          title: `🎁 ${label.title}`,
          body:  label.body,
          data: {
            type:     "gift_reminder",
            reminderId: r.id,
            route:    `/shop${r.preferredCategoryId ? `?cat=${r.preferredCategoryId}` : ""}`,
            occasion: r.occasion,
          },
        });
        await this.prisma.giftReminder.update({
          where: { id: r.id },
          data:  { lastNotifiedAt: now },
        });
        notified++;

        // ── Auto-order path (v1: push an intent; full order-placement
        //     integration is TODO — requires pricing + inventory +
        //     saved-payment + shipping. Doing it inline here would fail
        //     silently for any missing piece, so for now we log + push.)
        if (
          r.autoOrder &&
          r.productId &&
          r.savedAddressId &&
          daysUntil <= 2
        ) {
          const lastOrderedMs = r.lastAutoOrderedAt ? +r.lastAutoOrderedAt : 0;
          const safeToReorder = Date.now() - lastOrderedMs > 180 * 86_400_000;
          if (safeToReorder) {
            // TODO: wire OrdersService.createAutoOrder here once that helper
            // exists — for now, surface a stronger push so the customer
            // manually confirms in the app.
            await this.notifications.sendToCustomer(r.customerId, {
              title: "⏰ Auto-order pending",
              body:  "Confirm the gift you preset for this occasion.",
              data:  {
                type:       "gift_reminder_auto_confirm",
                reminderId: r.id,
                route:      `/reminders/${r.id}`,
              },
            });
            autoOrdered++;
          }
        }
      } catch (err) {
        this.log.error(`Reminder ${r.id} failed`, err as Error);
      }
    }

    return { scanned: reminders.length, notified, autoOrdered };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private validate(input: UpsertInput) {
    if (!input.occasion || input.occasion.trim().length === 0) {
      throw new BadRequestException("Occasion is required");
    }
    if (!input.eventDate) {
      throw new BadRequestException("Event date is required");
    }
    const d = new Date(input.eventDate);
    if (Number.isNaN(+d)) {
      throw new BadRequestException("Event date is invalid");
    }
    if (input.autoOrder && !input.productId) {
      throw new BadRequestException(
        "Auto-order requires a pinned product",
      );
    }
    if (input.autoOrder && !input.savedAddressId) {
      throw new BadRequestException(
        "Auto-order requires a saved delivery address",
      );
    }
    if (
      input.budgetMin != null &&
      input.budgetMax != null &&
      input.budgetMin > input.budgetMax
    ) {
      throw new BadRequestException("Budget min must be ≤ max");
    }
  }
}

// ─── Serialization ──────────────────────────────────────────────────────────

function serialize(row: any) {
  return {
    id:                  row.id,
    occasion:            row.occasion,
    recipientName:       row.recipientName,
    eventDate:           row.eventDate,
    recurring:           row.recurring,
    notifyDaysBefore:    row.notifyDaysBefore,
    budgetMin:           row.budgetMin,
    budgetMax:           row.budgetMax,
    preferredCategoryId: row.preferredCategoryId,
    productId:           row.productId,
    autoOrder:           row.autoOrder,
    savedAddressId:      row.savedAddressId,
    note:                row.note,
    active:              row.active,
    lastNotifiedAt:      row.lastNotifiedAt,
    lastAutoOrderedAt:   row.lastAutoOrderedAt,
    createdAt:           row.createdAt,
    updatedAt:           row.updatedAt,
  };
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Compute the next date at-or-after `from` on which the event recurs. */
function nextOccurrence(eventDate: Date, recurring: boolean, from: Date): Date {
  if (!recurring) return startOfDay(eventDate);
  const m = eventDate.getMonth();
  const d = eventDate.getDate();
  const candidate = new Date(from.getFullYear(), m, d);
  if (+candidate < +from) {
    candidate.setFullYear(from.getFullYear() + 1);
  }
  return candidate;
}

function buildOccasionLabel(
  occasion: string,
  recipientName: string | null,
  daysUntil: number,
): { title: string; body: string } {
  const who = recipientName?.trim() ? ` for ${recipientName.trim()}` : "";
  const when =
    daysUntil === 0 ? "today"
    : daysUntil === 1 ? "tomorrow"
    : `in ${daysUntil} days`;
  const occ = humaniseOccasion(occasion);
  return {
    title: `${occ}${who} ${when}`,
    body:  `Order now so your gift arrives on time.`,
  };
}

function humaniseOccasion(slug: string): string {
  const s = slug.toLowerCase();
  switch (s) {
    case "birthday":     return "Birthday 🎂";
    case "anniversary":  return "Anniversary 💍";
    case "christmas":    return "Christmas 🎄";
    case "diwali":       return "Diwali 🪔";
    case "holi":         return "Holi 🎨";
    case "valentine":    return "Valentine's Day 💝";
    case "mothers-day":  return "Mother's Day 🌸";
    case "fathers-day":  return "Father's Day 👔";
    case "rakhi":        return "Raksha Bandhan 🎗️";
    case "wedding":      return "Wedding 💐";
    case "housewarming": return "Housewarming 🏠";
    default:             return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
  }
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}
