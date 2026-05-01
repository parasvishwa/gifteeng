"use client";

import { useState, useEffect } from "react";
import { Badge, Input, Button } from "@gifteeng/ui";
import { Plus, Check, Loader2, ChevronDown, ChevronUp } from "lucide-react";

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    const res = await fetch(`${base}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}

export interface VariantSelection {
  type: string;
  values: string[];
}

interface Props {
  variants: VariantSelection[];
  onChange: (variants: VariantSelection[]) => void;
}

interface VariantOptionRow { id: string; variant_type: string; value: string }

const VARIANT_TYPES = [
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "material", label: "Material" },
  { key: "variant", label: "Other" },
];

export default function ImportVariantEditor({ variants, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [addingType, setAddingType] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingOptions, setExistingOptions] = useState<VariantOptionRow[]>([]);

  useEffect(() => {
    // TODO: wire to /api/variant-options
    safeGet<VariantOptionRow[]>("/variant-options", []).then(setExistingOptions);
  }, []);

  const getOptionsForType = (type: string) =>
    existingOptions.filter((o) => o.variant_type === type);

  const getVariantValues = (type: string) =>
    variants.find((v) => v.type === type)?.values || [];

  const toggleValue = (type: string, value: string) => {
    const current = getVariantValues(type);
    const exists = current.includes(value);
    const newValues = exists ? current.filter((v) => v !== value) : [...current, value];

    const updated = variants.filter((v) => v.type !== type);
    if (newValues.length > 0) updated.push({ type, values: newValues });
    onChange(updated);
  };

  const addNewValue = async (type: string) => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      // TODO: wire to POST /api/variant-options
      setExistingOptions((prev) => [...prev, { id: `${type}-${trimmed}`, variant_type: type, value: trimmed }]);
      toggleValue(type, trimmed);
      setNewValue("");
      setAddingType(null);
    } catch {}
    setSaving(false);
  };

  const totalSelected = variants.reduce((sum, v) => sum + v.values.length, 0);

  return (
    <div className="rounded-lg border border-border/30 bg-muted/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1">
          Variants
          {totalSelected > 0 && (
            <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5">
              {totalSelected}
            </Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {VARIANT_TYPES.map(({ key, label }) => {
            const options = getOptionsForType(key);
            const selected = getVariantValues(key);
            const isAdding = addingType === key;

            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
                  {!isAdding && (
                    <button
                      onClick={() => { setAddingType(key); setNewValue(""); }}
                      className="text-[9px] text-primary flex items-center gap-0.5 hover:underline"
                    >
                      <Plus className="w-2.5 h-2.5" /> New
                    </button>
                  )}
                </div>

                {isAdding && (
                  <div className="flex gap-1">
                    <Input
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNewValue(key)}
                      placeholder={`New ${label.toLowerCase()}...`}
                      className="h-5 text-[9px] flex-1"
                      autoFocus
                    />
                    <Button size="sm" className="h-5 w-5 p-0" onClick={() => addNewValue(key)} disabled={saving}>
                      {saving ? <Loader2 className="w-2 h-2 animate-spin" /> : <Check className="w-2 h-2" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-[10px]" onClick={() => setAddingType(null)}>×</Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-0.5">
                  {options.map((opt) => {
                    const isSelected = selected.includes(opt.value);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleValue(key, opt.value)}
                        className={`text-[9px] px-1.5 py-0.5 rounded-md border transition-all ${
                          isSelected
                            ? "border-primary/40 bg-primary/10 text-primary font-medium"
                            : "border-border/40 text-muted-foreground hover:border-border"
                        }`}
                      >
                        {opt.value}
                      </button>
                    );
                  })}
                  {selected
                    .filter((v) => !options.some((o) => o.value === v))
                    .map((v) => (
                      <button
                        key={v}
                        onClick={() => toggleValue(key, v)}
                        className="text-[9px] px-1.5 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary font-medium italic"
                      >
                        {v} ✕
                      </button>
                    ))}
                  {options.length === 0 && selected.length === 0 && !isAdding && (
                    <span className="text-[8px] text-muted-foreground italic">No {label.toLowerCase()} options yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
