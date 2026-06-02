"use client";

import { useState } from "react";
import { FileText, ListChecks, Table2 } from "lucide-react";
import { sanitizeHtml } from "../../../../lib/sanitize-html";

type TabKey = "description" | "highlights" | "specs";

export function ProductTabs({
  description,
  bullets,
  specs,
}: {
  description?: string | null;
  bullets: string[];
  specs: [string, string][];
}) {
  const tabs: { key: TabKey; label: string; icon: typeof FileText; show: boolean }[] = [
    {
      key: "description",
      label: "Description",
      icon: FileText,
      show: Boolean(description && description.trim().length > 0),
    },
    {
      key: "highlights",
      label: "Highlights",
      icon: ListChecks,
      show: bullets.length > 0,
    },
    {
      key: "specs",
      label: "Specifications",
      icon: Table2,
      show: specs.length > 0,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.show);

  const [active, setActive] = useState<TabKey>(
    visibleTabs[0]?.key ?? "description",
  );

  if (visibleTabs.length === 0) return null;

  const isHtml = typeof description === "string" && /<\w/.test(description);

  return (
    <section className="mt-14 border-t border-border/60 pt-10">
      {/* Tab strip */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border/60">
        {visibleTabs.map(({ key, label, icon: Icon }) => {
          const activeTab = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={
                "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors " +
                (activeTab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {active === "description" && description ? (
        isHtml ? (
          <div
            className="prose prose-sm max-w-none text-muted-foreground"
            // Description may be authored by any content_editor role — sanitize
            // before injecting so an injected <script> can't run on shopper
            // browsers. See docs/SECURITY_AUDIT.md finding H-1.
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
          />
        ) : (
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
            {description
              .split(/\n{2,}/)
              .map((para, i) => (
                <p key={i}>{para.trim()}</p>
              ))}
          </div>
        )
      ) : null}

      {active === "highlights" && bullets.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border/50 bg-background p-3 text-sm leading-relaxed"
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {active === "specs" && specs.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border/60">
          <table className="w-full text-sm">
            <tbody>
              {specs.map(([label, value], i) => (
                <tr
                  key={label}
                  className={
                    (i % 2 === 0 ? "bg-muted/30" : "bg-background") +
                    " border-b border-border/40 last:border-b-0"
                  }
                >
                  <td className="w-1/3 px-4 py-3 font-medium text-foreground">
                    {label}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
