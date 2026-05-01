"use client";

import { useState, useEffect, useRef } from "react";
import { Button, Input, Label, Switch, Dialog, DialogContent, DialogHeader, DialogTitle } from "@gifteeng/ui";
import { Plus, Pencil, Trash2, Save, Upload, Type, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@gifteeng/ui";


async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    const res = await fetch(`${base}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}

interface FontItem {
  id: string; name: string; font_family: string; font_url: string; is_active: boolean; sort_order: number;
}

export default function CustomFontsTab() {
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchFonts = async () => {
    // TODO: wire to /api/custom-fonts
    const data = await safeGet<FontItem[]>("/custom-fonts", []);
    setFonts(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchFonts(); }, []);

  useEffect(() => {
    fonts.forEach((f) => {
      if (f.font_url) {
        const style = document.createElement("style");
        style.textContent = `@font-face { font-family: '${f.font_family}'; src: url('${f.font_url}') format('truetype'); }`;
        document.head.appendChild(style);
      }
    });
  }, [fonts]);

  const handleUpload = async (file: File) => {
    const validExts = [".ttf", ".otf", ".woff", ".woff2"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExts.includes(ext)) { toast({ title: "Invalid format", description: "Use TTF, OTF, WOFF, WOFF2", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      const formData = new FormData();
      formData.append("file", file);
      // TODO: wire to /api/files/upload + /api/custom-fonts
      await fetch(`${base}/api/files/upload`, { method: "POST", body: formData });
      toast({ title: `Font "${file.name}" uploaded!` });
      fetchFonts();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!editItem?.name) return;
    // TODO: wire to PATCH /api/custom-fonts/:id
    toast({ title: "Saved!" }); setDialogOpen(false); setEditItem(null); fetchFonts();
  };

  const handleDelete = async (id: string, _fontUrl: string) => {
    if (!confirm("Delete this font?")) return;
    // TODO: wire to DELETE /api/custom-fonts/:id
    fetchFonts(); toast({ title: "Font deleted" });
  };

  const toggleActive = async (_f: FontItem) => {
    // TODO: wire to PATCH /api/custom-fonts/:id
    fetchFonts();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">Upload TTF, OTF, WOFF, or WOFF2 fonts for the customizer.</p>
        <div>
          <input ref={fileInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          <Button size="sm" className="h-8 text-xs gap-1" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3 h-3" /> {uploading ? "Uploading..." : "Upload Font"}
          </Button>
        </div>
      </div>

      {fonts.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Type className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">No custom fonts yet</p>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3 h-3" /> Upload first font
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {fonts.map((f) => (
            <div key={f.id} className={`bg-card rounded-xl border border-border/40 p-3 transition-opacity ${!f.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Type className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{f.name}</p>
                    <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{f.font_family}</span>
                  </div>
                  <p className="text-sm truncate mt-0.5" style={{ fontFamily: `'${f.font_family}', sans-serif` }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => toggleActive(f)} className={`p-1.5 rounded-lg transition-colors ${f.is_active ? "text-green-600 bg-green-500/10" : "text-muted-foreground bg-muted/50"}`}>
                    {f.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => { setEditItem(f); setDialogOpen(true); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(f.id, f.font_url)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[340px] p-4">
          <DialogHeader><DialogTitle className="text-sm">Edit Font</DialogTitle></DialogHeader>
          <div className="space-y-2.5">
            <div><Label className="text-[10px] text-muted-foreground">Display Name</Label><Input value={editItem?.name || ""} onChange={e => setEditItem((p: any) => ({ ...p, name: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-[10px] text-muted-foreground">Font Family (CSS)</Label><Input value={editItem?.font_family || ""} onChange={e => setEditItem((p: any) => ({ ...p, font_family: e.target.value }))} className="h-8 text-xs font-mono" /></div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div><Label className="text-[10px] text-muted-foreground">Sort Order</Label><Input type="number" value={editItem?.sort_order ?? 0} onChange={e => setEditItem((p: any) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
              <div className="flex items-center gap-2 h-8">
                <Switch checked={editItem?.is_active ?? true} onCheckedChange={v => setEditItem((p: any) => ({ ...p, is_active: v }))} className="scale-90" />
                <span className="text-[11px] text-muted-foreground">{editItem?.is_active ? "Active" : "Hidden"}</span>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full h-8 text-xs gap-1"><Save className="w-3 h-3" /> Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}