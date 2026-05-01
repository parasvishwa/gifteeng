#!/usr/bin/env python3
"""
Patches the collections admin page on the server with 4 targeted changes:
1. Fix API_BASE to be browser-aware (window.location.origin)
2. Add ?all=true to fetchCollections so drafts show in admin
3. Fix handleSave payload (title/heroImage/isPublished vs name/image/is_active)
4. Add grouping by description in list view
"""
import re

path = "/srv/gifteeng/apps/web/app/b2b/super-admin/collections/page.tsx"
src = open(path).read()
original = src

# ── 1. Fix API_BASE ──────────────────────────────────────────────────────────
src = src.replace(
    "const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';",
    "function getApiBase() { return typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'); }",
    1
)
# update all references to API_BASE inside the functions to use getApiBase()
src = src.replace(
    "const r = await fetch(`${API_BASE}/api${path}`, { headers: authHeaders() });",
    "const r = await fetch(`${getApiBase()}/api${path}`, { headers: authHeaders() });",
    1
)
src = src.replace(
    "const r = await fetch(`${API_BASE}/api${path}`, { method: 'POST', headers:",
    "const r = await fetch(`${getApiBase()}/api${path}`, { method: 'POST', headers:",
    1
)
src = src.replace(
    "const r = await fetch(`${API_BASE}/api${path}`, { method: 'PATCH', headers:",
    "const r = await fetch(`${getApiBase()}/api${path}`, { method: 'PATCH', headers:",
    1
)

# ── 2. Fetch all collections (include drafts) ────────────────────────────────
src = src.replace(
    "const data = await safeGet<Collection[]>('/collections', []);",
    "const data = await safeGet<Collection[]>('/collections?all=true', []);",
    1
)

# ── 3. Fix handleSave payload ────────────────────────────────────────────────
old_payload = "    const payload = { name: editItem.name, description: editItem.description || \"\", image: editItem.image || \"\", is_active: editItem.is_active ?? true, sort_order: editItem.sort_order ?? 0 };"
new_payload = """    // Map frontend snake_case → API camelCase (NestJS controller schema)
    const payload = { title: editItem.name, description: editItem.description || "", heroImage: editItem.image || "", isPublished: editItem.is_active ?? true, sortOrder: editItem.sort_order ?? 0 };"""
src = src.replace(old_payload, new_payload, 1)

# ── 4. Fix delete (use proper DELETE method, not POST) ───────────────────────
src = src.replace(
    "    // TODO: delete endpoint\n    await safePost(`/collections/${id}/delete`, {}, null);",
    "    await fetch(`${getApiBase()}/api/collections/${id}`, { method: 'DELETE', headers: authHeaders() });",
    1
)

# ── 5. Add grouping constants + computed maps after collections state ─────────
grouping_addition = """
  /** Group collections by description (acts as the group/category label) */
  const GROUP_ORDER = ["By Relation", "By Occasion", "By Theme", "By Profession", "By Use Case", "Other"];
  const groups = useMemo(() => {
    const map: Record<string, Collection[]> = {};
    filtered.forEach(c => {
      const g = c.description?.trim() || "Other";
      (map[g] = map[g] || []).push(c);
    });
    return map;
  }, [filtered]);
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groups);
    return [...GROUP_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !GROUP_ORDER.includes(k))];
  }, [groups]);
"""

# insert the grouping code after the `filtered` useMemo
src = src.replace(
    "  const activeCount = collections.filter(c => c.is_active).length;",
    grouping_addition + "\n  const activeCount = collections.filter(c => c.is_active).length;",
    1
)

# ── 6. Replace the flat list render with a grouped render ────────────────────
flat_list = """      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">{search ? "No matches" : "No collections yet"}</p>
          <p className="text-xs text-muted-foreground mb-4">{search ? "Try a different search" : "Group products into collections"}</p>
          {!search && <Button size="sm" className="text-xs gap-1.5" onClick={openCreate}><Plus className="w-3.5 h-3.5" /> Create First</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c, idx) => {
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx;
            return (
              <div key={c.id}
                {...getDragProps(idx)}
                onClick={() => openEdit(c)}
                className={`bg-card rounded-xl border p-3 flex items-center gap-3 transition-all cursor-pointer group ${
                  isDragging ? "opacity-50 scale-[0.98] border-primary/40" :
                  isOver ? "border-primary/60 shadow-md" :
                  "border-border/40 hover:shadow-sm"
                }`}>
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
                {c.image ? (
                  <img src={c.image} alt={c.name} className="w-12 h-12 rounded-lg object-cover border border-border/30 shrink-0" />
                ) : (
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${c.is_active ? "bg-emerald-500/10" : "bg-muted/60"}`}>
                    {c.is_active ? <Globe className="w-5 h-5 text-emerald-600" /> : <FileEdit className="w-5 h-5 text-muted-foreground/40" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <Badge variant={c.is_active ? "default" : "secondary"}
                      className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${c.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}`}>
                      {c.is_active ? "Active" : "Draft"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">{productCounts[c.id] || 0} items</Badge>
                  </div>
                  {c.description && <p className="text-[10px] text-muted-foreground line-clamp-1">{c.description}</p>}
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      )}"""

grouped_list = """      {collections.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">No collections yet</p>
          <p className="text-xs text-muted-foreground mb-4">Group products into curated collections</p>
          <Button size="sm" className="text-xs gap-1.5" onClick={openCreate}><Plus className="w-3.5 h-3.5" /> Create First</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-12 text-center">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No collections match &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroupKeys.map(groupName => (
            <div key={groupName}>
              {/* Group header */}
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{groupName}</p>
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{groups[groupName].length}</span>
              </div>
              {/* Items in this group */}
              <div className="space-y-1.5 pl-1">
                {groups[groupName].map(c => (
                  <div key={c.id} onClick={() => openEdit(c)}
                    className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3 transition-all cursor-pointer group hover:shadow-sm hover:border-border/60">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />
                    {c.image ? (
                      <img src={c.image} alt={c.name} className="w-10 h-10 rounded-lg object-cover border border-border/30 shrink-0" />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.is_active ? "bg-emerald-500/10" : "bg-muted/60"}`}>
                        {c.is_active ? <Globe className="w-4 h-4 text-emerald-600" /> : <FileEdit className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <Badge variant={c.is_active ? "default" : "secondary"}
                          className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${c.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}`}>
                          {c.is_active ? "Active" : "Draft"}
                        </Badge>
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}"""

src = src.replace(flat_list, grouped_list, 1)

# ── 7. Update header stats to include group count ────────────────────────────
src = src.replace(
    "          <p className=\"text-xs text-muted-foreground\">{activeCount} active · {totalProdCount} products · {collections.length} total</p>",
    "          <p className=\"text-xs text-muted-foreground\">{activeCount} active · {collections.length} total · {sortedGroupKeys.length} groups</p>",
    1
)

# ── Report ────────────────────────────────────────────────────────────────────
changed = src != original
if changed:
    open(path, "w").write(src)
    print("✅ collections/page.tsx patched successfully")
else:
    print("⚠️  No changes made — patterns may not have matched")
    print("   (file may already be updated, or whitespace differs)")
