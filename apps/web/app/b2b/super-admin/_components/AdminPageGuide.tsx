"use client";

import { useState } from "react";
import { HelpCircle, ChevronUp, Lightbulb } from "lucide-react";

interface GuideStep {
  text: string;
}

interface AdminPageGuideProps {
  title: string;
  description: string;
  steps?: GuideStep[];
  tips?: string[];
}

const DISMISSED_KEY = "admin_guide_dismissed";

function getDismissed(): string[] {
  try {
    if (typeof window === "undefined") return [];
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function AdminPageGuide({ title, description, steps, tips }: AdminPageGuideProps) {
  const [expanded, setExpanded] = useState(() => !getDismissed().includes(title));

  const dismiss = () => {
    setExpanded(false);
    const d = getDismissed();
    if (!d.includes(title)) localStorage.setItem(DISMISSED_KEY, JSON.stringify([...d, title]));
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors mb-4"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span>How to use this page?</span>
      </button>
    );
  }

  return (
    <div className="mb-5 bg-primary/5 border border-primary/15 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <HelpCircle className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <button onClick={dismiss} className="p-1 rounded-md hover:bg-muted/50 shrink-0 text-muted-foreground" title="Hide guide">
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {(steps?.length || tips?.length) && (
        <div className="px-4 pb-3 space-y-3">
          {steps && steps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Steps</p>
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span className="leading-relaxed">{s.text}</span>
                </div>
              ))}
            </div>
          )}
          {tips && tips.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Tips</p>
              {tips.map((t, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
