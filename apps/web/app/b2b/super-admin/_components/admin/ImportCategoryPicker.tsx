"use client";

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input, Button } from "@gifteeng/ui";
import { Plus, Check, Loader2, FolderOpen } from "lucide-react";
import { safeGet } from "@/lib/admin-api";

interface Props {
  value: string;
  onChange: (category: string) => void;
  className?: string;
}

interface CategoryRow { id: string; name: string }

export default function ImportCategoryPicker({ value, onChange, className }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  useEffect(() => {
    safeGet<CategoryRow[]>("/categories", []).then(setCategories);
  }, []);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      // TODO: wire to POST /api/categories
      setCategories((prev) => [...prev, { id: trimmed, name: trimmed }]);
      onChange(trimmed);
      setNewName("");
      setCreating(false);
    } catch {
      // silently fail
    }
    setSaving(false);
  };

  if (creating) {
    return (
      <div className={`flex gap-1 ${className}`}>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New category name..."
          className="h-6 text-[10px] flex-1"
          autoFocus
        />
        <Button size="sm" variant="default" className="h-6 w-6 p-0" onClick={handleCreate} disabled={saving || !newName.trim()}>
          {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setCreating(false)}>
          ×
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      <Select value={value || "uncategorized"} onValueChange={(v) => v !== "__create__" ? onChange(v) : setCreating(true)}>
        <SelectTrigger className="h-6 text-[10px] border-border/40 flex-1">
          <FolderOpen className="w-2.5 h-2.5 text-muted-foreground mr-1" />
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.name} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
          {value && !categories.some((c) => c.name === value) && (
            <SelectItem value={value} className="text-xs italic text-muted-foreground">
              {value} (new)
            </SelectItem>
          )}
          <SelectItem value="__create__" className="text-xs text-primary font-medium">
            <span className="flex items-center gap-1">
              <Plus className="w-3 h-3" /> Create New Category
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
