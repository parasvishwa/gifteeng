"use client";

/**
 * OccasionBanner — a single-line notification shown on the homepage when
 * a saved reminder is within 10 days OR a national event is within 30.
 *
 * Redesigned for Deploy 116 — the previous version was a two-row stack
 * with competing colors. New look:
 *   - One line, one message
 *   - Subtle accent bar on the left (red when urgent, pink otherwise)
 *   - Light cream background in light mode, subtle zinc tint in dark mode
 *   - Clean typography, one CTA, a dismiss button
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ReminderType = "birthday" | "anniversary" | "other";
type Reminder     = { id: string; name: string; relation: string; type: ReminderType; month: number; day: number };

// ── Upcoming national events (month/day; updated yearly) ───────────────────────
const EVENTS: { label: string; emoji: string; month: number; day: number }[] = [
  { label: "Mother's Day",   emoji: "💐", month: 5,  day: 11 },
  { label: "Father's Day",   emoji: "👔", month: 6,  day: 15 },
  { label: "Friendship Day", emoji: "🤝", month: 8,  day: 3  },
  { label: "Raksha Bandhan", emoji: "🪢", month: 8,  day: 9  },
  { label: "Teacher's Day",  emoji: "🍎", month: 9,  day: 5  },
  { label: "Dussehra",       emoji: "🏹", month: 10, day: 2  },
  { label: "Diwali",         emoji: "🪔", month: 10, day: 20 },
  { label: "Christmas",      emoji: "🎄", month: 12, day: 25 },
  { label: "New Year",       emoji: "🎆", month: 1,  day: 1  },
  { label: "Valentine's Day", emoji: "❤️", month: 2, day: 14 },
  { label: "Holi",           emoji: "🎨", month: 3,  day: 14 },
];

function daysUntil(month: number, day: number): number {
  const now    = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(now.getFullYear(), month - 1, day);
  if (target.getTime() < now.getTime()) target.setFullYear(target.getFullYear() + 1);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
}

function reminderEmoji(t: ReminderType) {
  return t === "birthday" ? "🎂" : t === "anniversary" ? "💍" : "🎉";
}

function nextNationalEvent() {
  return EVENTS
    .map((e) => ({ ...e, days: daysUntil(e.month, e.day) }))
    .filter((e) => e.days > 0 && e.days <= 30)
    .sort((a, b) => a.days - b.days)[0] ?? null;
}

export default function OccasionBanner() {
  const [reminder, setReminder]   = useState<Reminder & { days: number } | null>(null);
  const [event, setEvent]         = useState<ReturnType<typeof nextNationalEvent> | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const all: Reminder[] = JSON.parse(localStorage.getItem("gifteeng.reminders") ?? "[]");
      const soon = all
        .map((r) => ({ ...r, days: daysUntil(r.month, r.day) }))
        .filter((r) => r.days <= 10)
        .sort((a, b) => a.days - b.days)[0];
      if (soon) setReminder(soon);
    } catch { /* no-op */ }
    setEvent(nextNationalEvent());
  }, []);

  if (dismissed) return null;

  // Decide which single message to show. Personal reminder wins over events.
  const content = reminder
    ? {
        emoji:  reminderEmoji(reminder.type),
        text:   reminder.days === 0
          ? <>{reminder.name}&apos;s {reminder.type} is <strong>today</strong> — order a digital gift card.</>
          : reminder.days === 1
            ? <><strong>1 day</strong> to {reminder.name}&apos;s {reminder.type}. Standard delivery may miss — try a gift card.</>
            : reminder.days < 4
              ? <><strong>{reminder.days} days</strong> to {reminder.name}&apos;s {reminder.type}. Cutting it close — consider a digital gift card.</>
              : <>{reminder.name}&apos;s {reminder.type} is in <strong>{reminder.days} days</strong>.</>,
        cta:    reminder.days < 4 ? { label: "Gift Card →", href: "/gift-cards" } : { label: "Shop Now →", href: "/products" },
        urgent: reminder.days < 4,
      }
    : event
      ? {
          emoji:  event.emoji,
          text:   <><strong>{event.label}</strong> is in <strong>{event.days} days</strong> — order early.</>,
          cta:    { label: "Shop Now →", href: "/products" },
          urgent: false,
        }
      : null;

  if (!content) return null;

  return (
    <div className="my-3 rounded-xl border border-border/60 overflow-hidden bg-[#12131A]">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Accent bar */}
        <span
          aria-hidden
          className="shrink-0 w-0.5 h-7 rounded-full bg-[#EF3752]"
        />
        {/* Emoji */}
        <span className="shrink-0 text-base leading-none">{content.emoji}</span>
        {/* Message */}
        <p className="flex-1 min-w-0 text-[13px] leading-snug text-white/85">
          {content.text}
        </p>
        {/* CTA */}
        <Link
          href={content.cta.href}
          className="shrink-0 text-[11px] font-bold rounded-xl px-3 py-1.5 transition-colors bg-[#EF3752] text-white hover:bg-[#EF3752]/90"
        >
          {content.cta.label}
        </Link>
        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-white/40 hover:text-white/80 transition-colors p-1 -mr-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
