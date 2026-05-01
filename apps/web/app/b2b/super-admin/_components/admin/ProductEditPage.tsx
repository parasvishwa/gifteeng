"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  ArrowLeft, Upload, Loader2, Plus, X, Save, Sparkles,
  GripVertical, Trash2, Image as ImageIcon, Layout, Package, DollarSign,
  Tag, Layers, Wand2, ImagePlus, AlertCircle, CheckCircle2, Eye, EyeOff, Settings,
  Search, LayoutTemplate,
} from "lucide-react";
import {
  Button, Input, Label, Switch, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent,
} from "@gifteeng/ui";
import ProductTemplateEditor from "./ProductTemplateEditor";
import VariantPricingSection from "./VariantPricingSection";
import { adminGet } from "@/lib/admin-api";
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

// ── Stub upload/file helpers (replace legacy uploadUtils) ────
function validateFile(_file: File, _kind: string) { return { valid: true, error: "" }; }
function validateFiles(_files: FileList, _kind: string) { return { valid: true, error: "" }; }

interface Product {
  id: string; name: string; category: string; subcategory: string;
  price: number; original_price: number; image: string; description: string;
  rating: number; reviews: number; is_active: boolean; customizable: boolean;
  shipping_charge: number; is_free_gift: boolean; colors: string[] | null;
  sizes: string[] | null; tags: string[] | null; material: string | null;
  mask_shape: string | null; mask_label: string | null; video: string | null;
  printing: string; finish: string; delivery_time: string; features: string[];
  track_inventory: boolean; inventory_count: number; sort_order: number;
  meta_title?: string; meta_description?: string;
  detail_template?: string | null; detail_content?: any;
  hsn_code?: string | null; max_images?: number; min_images?: number;
  max_texts?: number; min_texts?: number; max_masks?: number; min_masks?: number;
  customizer_mode?: string; customizer_image?: string;
  simple_image_label?: string; simple_text_label?: string;
  simple_image_x?: number; simple_image_y?: number;
  simple_image_width?: number; simple_image_height?: number;
  simple_text_x?: number; simple_text_y?: number;
  simple_text_width?: number; simple_text_height?: number;
}

interface ProductImage { id: string; product_id: string; image_url: string; sort_order: number; is_active: boolean; alt_text?: string; }
interface Category { id: string; name: string; parent_id: string | null; }
interface Collection { id: string; name: string; }
interface VariantOption { id: string; variant_type: string; value: string; sort_order: number; is_active: boolean; }

interface DesignTemplate {
  id: string; label: string; category?: string | null;
  thumbnail?: string | null; is_active: boolean; sort_order: number; canvas_json?: unknown;
}

const CUST_MODES = [
  { key: "design",   icon: "🖼️",  label: "Design variants",     hint: "Customer picks from preset design chips" },
  { key: "template", icon: "📋",  label: "Templates",            hint: "Customer selects & edits a canvas template" },
  { key: "full",     icon: "🎨",  label: "Full customisation",   hint: "Customer uses the full canvas editor" },
  { key: "simple",   icon: "✏️",  label: "Simple customisation", hint: "Customer uploads image / adds text" },
];

const TMPL_CAT_COLORS: Record<string, string> = {
  Birthday: "bg-pink-100 text-pink-700", Anniversary: "bg-amber-100 text-amber-700",
  "Thank You": "bg-orange-100 text-orange-700", Wedding: "bg-stone-100 text-stone-700",
  Baby: "bg-emerald-100 text-emerald-700", Festival: "bg-yellow-100 text-yellow-800",
  Corporate: "bg-blue-100 text-blue-700", Love: "bg-red-100 text-red-700",
  Graduation: "bg-purple-100 text-purple-700", "Get Well": "bg-green-100 text-green-700",
};
function tmplCatBadge(cat?: string | null) {
  if (!cat) return "bg-muted text-muted-foreground";
  return TMPL_CAT_COLORS[cat] ?? "bg-muted text-muted-foreground";
}

interface Props {
  product: Product; isNew: boolean; categories: Category[];
  collections: Collection[]; variantOptions: VariantOption[];
  onSave: (product: Product) => void; onClose: () => void;
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1">
      <Label className="text-xs font-medium text-foreground">{children}</Label>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card rounded-xl border border-border/50 p-4 shadow-sm space-y-3 ${className}`}>{children}</div>;
}

function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: any; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-primary" /></div>
        <div>
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const MOCKUP_STYLES = [
  { label: "Lifestyle", prompt: "Place this product in a cozy home lifestyle setting with warm lighting" },
  { label: "White BG", prompt: "Place this product on a clean white background, professional e-commerce style" },
  { label: "Gift Wrapped", prompt: "Show this product beautifully gift-wrapped with ribbon" },
  { label: "Festive", prompt: "Show this product in a festive celebration setting" },
];

async function uploadFileToApi(file: File): Promise<string> {
  // TODO: wire to /api/files/upload — return public URL
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${base}/api/files/upload`, { method: "POST", body: formData });
    if (!res.ok) return "";
    const json = await res.json();
    return json?.url || "";
  } catch { return ""; }
}

export default function ProductEditPage({ product: initialProduct, isNew, categories, collections, variantOptions, onSave, onClose }: Props) {
  const [editing, setEditing] = useState<Product>({ ...initialProduct });
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [productCollectionIds, setProductCollectionIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [multiUploading, setMultiUploading] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [keywords, setKeywords] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [mockupGenerating, setMockupGenerating] = useState(false);
  const [generatedMockups, setGeneratedMockups] = useState<string[]>([]);
  const [savingMockup, setSavingMockup] = useState<number | null>(null);
  const [customizerUploading, setCustUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customizerFileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const buildInitialVariantMap = () => {
    const map: Record<string, string[]> = {};
    if (initialProduct.sizes && initialProduct.sizes.length > 0) map["size"] = [...initialProduct.sizes];
    if (initialProduct.colors && initialProduct.colors.length > 0) map["color"] = [...initialProduct.colors];
    if (initialProduct.material) map["material"] = [initialProduct.material];
    return map;
  };
  const [selectedVariantMap, setSelectedVariantMap] = useState<Record<string, string[]>>(buildInitialVariantMap);

  const parentCategories = categories.filter(c => !c.parent_id);
  const getSubcategories = (parentName: string) => {
    const parent = categories.find(c => !c.parent_id && c.name === parentName);
    return parent ? categories.filter(c => c.parent_id === parent.id) : [];
  };
  const subcats = getSubcategories(editing.category);
  const discount = editing.original_price > editing.price
    ? Math.round(((editing.original_price - editing.price) / editing.original_price) * 100) : 0;

  useEffect(() => {
    const fetchTags = async () => {
      // TODO: wire to /api/products/tags
      const data = await safeGet<{ items?: any[] } | any[]>("/products/tags", []);
      const arr = Array.isArray(data) ? data : (data?.items || []);
      const tagSet = new Set<string>();
      arr.forEach((p: any) => { if (p.tags) p.tags.forEach((t: string) => tagSet.add(t)); });
      setAllTags(Array.from(tagSet).sort());
    };
    fetchTags();
  }, []);

  useEffect(() => {
    if (editing.id && !isNew) {
      fetchProductImages(editing.id);
      fetchProductCollections(editing.id);
    }
  }, [editing.id]);

  const fetchProductImages = async (pid: string) => {
    // TODO: wire to /api/products/:id/images
    const data = await safeGet<ProductImage[]>(`/products/${pid}/images`, []);
    setProductImages(data || []);
  };
  const fetchProductCollections = async (pid: string) => {
    // TODO: wire to /api/products/:id/collections
    const data = await safeGet<{ collection_id: string }[]>(`/products/${pid}/collections`, []);
    setProductCollectionIds((data || []).map((d: any) => d.collection_id));
  };

  const handleImageUpload = async (file: File) => {
    const check = validateFile(file, "image");
    if (!check.valid) { toast({ title: check.error, variant: "destructive" }); return; }
    setUploading(true);
    try {
      const url = await uploadFileToApi(file);
      if (url) setEditing(prev => ({ ...prev, image: url }));
      toast({ title: "Image uploaded!" });
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    setUploading(false);
  };

  const handleCustomizerImageUpload = async (file: File) => {
    const check = validateFile(file, "image");
    if (!check.valid) { toast({ title: check.error, variant: "destructive" }); return; }
    setCustUploading(true);
    try {
      const url = await uploadFileToApi(file);
      if (url) setEditing(prev => ({ ...prev, customizer_image: url }));
      toast({ title: "Customization image uploaded!" });
    } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
    setCustUploading(false);
  };

  const handleMultiImageUpload = async (files: FileList) => {
    if (!editing.id || files.length === 0) return;
    const check = validateFiles(files, "image");
    if (!check.valid) { toast({ title: check.error, variant: "destructive" }); return; }
    setMultiUploading(true);
    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadFileToApi(files[i]);
        if (url) successCount++;
        // TODO: wire to POST /api/products/:id/images
      } catch (err: any) { toast({ title: `Upload failed for ${files[i].name}`, description: err.message, variant: "destructive" }); }
    }
    if (successCount > 0) toast({ title: `${successCount} image(s) uploaded!` });
    fetchProductImages(editing.id);
    setMultiUploading(false);
  };

  const deleteProductImage = async (_imgId: string) => {
    // TODO: wire to DELETE /api/product-images/:id
    if (editing.id) fetchProductImages(editing.id);
  };

  const reorderImage = async (fromIndex: number, toIndex: number) => {
    const reordered = [...productImages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setProductImages(reordered);
    setDragOverIndex(null);
    // TODO: wire to PATCH /api/product-images/reorder
  };

  const setAsMainImage = (url: string) => {
    setEditing(prev => ({ ...prev, image: url }));
    toast({ title: "Main image updated" });
  };

  const toggleCollection = async (collectionId: string) => {
    if (!editing.id) return;
    if (productCollectionIds.includes(collectionId)) {
      // TODO: wire to DELETE /api/products/:id/collections/:cid
      setProductCollectionIds(prev => prev.filter(id => id !== collectionId));
    } else {
      // TODO: wire to POST /api/products/:id/collections/:cid
      setProductCollectionIds(prev => [...prev, collectionId]);
    }
  };

  const handleSave = () => {
    const updatedProduct = {
      ...editing,
      sizes: selectedVariantMap["size"] || [],
      colors: selectedVariantMap["color"] || [],
      material: (selectedVariantMap["material"] || [])[0] || null,
      meta_title: editing.meta_title || `${editing.name} | Gifteeng`.slice(0, 60),
      meta_description: editing.meta_description || (editing.description ? editing.description.replace(/<[^>]*>/g, '').slice(0, 160) : `Buy ${editing.name} online at Gifteeng.`.slice(0, 160)),
    };
    onSave(updatedProduct);
  };

  const handleAiGenerate = async () => {
    const kw = keywords.trim() || editing.name?.trim();
    if (!kw) {
      toast({ title: "Enter keywords or a product name first", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
      const res = await fetch(`${base}/api/admin/ai/generate-seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          keyword: kw,
          context: [editing.category, editing.subcategory].filter(Boolean).join(" > "),
        }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json() as {
        title?: string; description?: string; bullets?: string[];
        metaTitle?: string; metaDescription?: string; keywords?: string[];
      };
      setEditing(prev => ({
        ...prev,
        name:             data.title        || prev.name,
        description:      data.description  || prev.description,
        features:         data.bullets      || prev.features,
        meta_title:       data.metaTitle    || prev.meta_title,
        meta_description: data.metaDescription || prev.meta_description,
        tags:             data.keywords     ? [...new Set([...(prev.tags || []), ...data.keywords])] : prev.tags,
      }));
      toast({ title: "✨ AI content generated!" });
    } catch (err: any) {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    }
    setAiGenerating(false);
  };

  const generateMockup = async (prompt: string) => {
    if (!editing.image) { toast({ title: "Upload main image first", variant: "destructive" }); return; }
    setMockupGenerating(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
      const res = await fetch(`${base}/api/admin/ai/enhance-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ imageUrl: editing.image, style: prompt }),
      });
      if (res.ok) {
        const data = await res.json() as { url?: string };
        if (data.url) setGeneratedMockups(prev => [...prev, data.url!]);
        toast({ title: "Mockup generated!" });
      } else {
        toast({ title: "Mockup generation unavailable", variant: "destructive" });
      }
    } catch (err: any) { toast({ title: "Mockup failed", description: err.message, variant: "destructive" }); }
    setMockupGenerating(false);
  };

  const saveMockupToGallery = async (imageUrl: string, idx: number) => {
    if (!editing.id || isNew) { toast({ title: "Save product first", variant: "destructive" }); return; }
    setSavingMockup(idx);
    try {
      // TODO: wire to POST /api/products/:id/images
      toast({ title: "Saved to gallery!" });
      fetchProductImages(editing.id);
    } catch (err: any) { toast({ title: "Save failed", description: err.message, variant: "destructive" }); }
    setSavingMockup(null);
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !(editing.tags || []).includes(t)) {
      setEditing({ ...editing, tags: [...(editing.tags || []), t] });
    }
    setTagInput("");
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-display font-bold truncate">{isNew ? "Add Product" : editing.name || "Edit Product"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-muted-foreground">Active</span>
            <Switch checked={editing.is_active} onCheckedChange={v => setEditing({ ...editing, is_active: v })} />
          </div>
          <Button onClick={handleSave} size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm">
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue="product" className="w-full">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="product" className="flex-1 gap-1.5 text-xs"><Package className="w-3.5 h-3.5" /> Product Info</TabsTrigger>
          <TabsTrigger value="template" className="flex-1 gap-1.5 text-xs"><Layout className="w-3.5 h-3.5" /> Detail Page Template</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: PRODUCT INFO ═══ */}
        <TabsContent value="product" className="space-y-4 mt-0">

          {/* AI Generation Bar */}
          <div className="bg-gradient-to-r from-primary/8 to-primary/3 rounded-xl border border-primary/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground">One-Click AI</span>
              <span className="text-[10px] text-muted-foreground">— enter keywords, select category, then hit generate</span>
            </div>
            <div className="flex gap-2">
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="e.g. personalized wooden nameplate LED backlit"
                className="text-xs h-9 flex-1 border-primary/20" onKeyDown={e => { if (e.key === "Enter") handleAiGenerate(); }} />
              <Button onClick={handleAiGenerate} disabled={aiGenerating} size="sm" className="gap-1.5 text-xs shrink-0 h-9 rounded-lg">
                {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiGenerating ? "Generating…" : "Generate All"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT COLUMN (2/3) */}
            <div className="lg:col-span-2 space-y-4">

              {/* Basic Info */}
              <SectionCard>
                {isNew && (
                  <div>
                    <FieldLabel hint="URL slug, cannot change later">Product ID</FieldLabel>
                    <Input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} placeholder="my-product-slug" className="font-mono text-xs h-9" />
                  </div>
                )}
                <div>
                  <FieldLabel>Product Title</FieldLabel>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Product title" className="text-sm font-medium h-10" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <FieldLabel>Description</FieldLabel>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 rounded-full" onClick={() => setShowHtmlPreview(!showHtmlPreview)}>
                      {showHtmlPreview ? <><EyeOff className="w-3 h-3" /> Code</> : <><Eye className="w-3 h-3" /> Preview</>}
                    </Button>
                  </div>
                  {showHtmlPreview ? (
                    <div className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[100px] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: editing.description }} />
                  ) : (
                    <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background p-3 text-xs min-h-[100px] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder="<p>Product description...</p>" />
                  )}
                </div>
                <div>
                  <FieldLabel>Features</FieldLabel>
                  <Input value={(editing.features || []).join(", ")} onChange={(e) => setEditing({ ...editing, features: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })}
                    placeholder="Washable, UV Resistant, Scratch Proof" className="text-xs h-9" />
                  {editing.features?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {editing.features.map((f, i) => <Badge key={i} variant="secondary" className="text-[10px] rounded-full">✓ {f}</Badge>)}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Main Image + Gallery */}
              <SectionCard>
                <SectionHeader icon={ImageIcon} title="Images" subtitle="Main image & gallery"
                  action={
                    <Button onClick={() => multiFileInputRef.current?.click()} disabled={multiUploading || (!editing.id && isNew)} size="sm" variant="outline" className="gap-1 text-[10px] h-7 rounded-full">
                      {multiUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add Gallery
                    </Button>
                  } />
                <div className="flex items-start gap-3">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0 cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> :
                      editing.image ? <img src={editing.image} alt="" className="w-full h-full object-cover" /> :
                        <div className="text-center"><Upload className="w-5 h-5 text-muted-foreground/30 mx-auto" /><span className="text-[9px] text-muted-foreground">Upload</span></div>}
                  </div>
                  <div className="flex-1">
                    <Input value={editing.image || ""} onChange={(e) => setEditing({ ...editing, image: e.target.value })} placeholder="Paste image URL or click to upload" className="text-xs h-8" />
                    {productImages.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {productImages.map((img, idx) => (
                          <div key={img.id} draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
                            onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                            onDragLeave={() => setDragOverIndex(null)}
                            onDrop={(e) => { e.preventDefault(); reorderImage(Number(e.dataTransfer.getData("text/plain")), idx); }}
                            className={`w-14 h-14 rounded-lg border-2 overflow-hidden relative group cursor-grab active:cursor-grabbing transition-all ${dragOverIndex === idx ? "border-primary scale-105" : "border-border/50"}`}>
                            <img src={img.image_url} alt={img.alt_text || ""} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/50 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => setAsMainImage(img.image_url)} className="p-1 bg-card rounded shadow" title="Set as main"><ImageIcon className="w-2.5 h-2.5" /></button>
                              <button onClick={() => deleteProductImage(img.id)} className="p-1 bg-destructive text-destructive-foreground rounded shadow" title="Delete"><Trash2 className="w-2.5 h-2.5" /></button>
                            </div>
                            <div className="absolute top-0.5 left-0.5 bg-foreground/60 text-background rounded text-[8px] w-4 h-4 flex items-center justify-center font-bold">{idx + 1}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); e.target.value = ""; }} />
                <input ref={multiFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleMultiImageUpload(e.target.files); e.target.value = ""; }} />

                {/* AI Mockups */}
                {editing.image && (
                  <div className="pt-2 border-t border-border/40">
                    <div className="flex items-center gap-2 mb-2">
                      <ImagePlus className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-semibold text-foreground">AI Mockups</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {MOCKUP_STYLES.map(s => (
                        <Button key={s.label} variant="outline" size="sm" disabled={mockupGenerating} onClick={() => generateMockup(s.prompt)}
                          className="text-[10px] h-7 gap-1 rounded-full border-primary/20 hover:bg-primary/5">
                          <Sparkles className="w-2.5 h-2.5" /> {s.label}
                        </Button>
                      ))}
                    </div>
                    {mockupGenerating && <div className="flex items-center gap-2 mt-2 text-[10px] text-primary"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</div>}
                    {generatedMockups.length > 0 && (
                      <div className="flex gap-2 mt-2 overflow-x-auto">
                        {generatedMockups.map((img, idx) => (
                          <div key={idx} className="w-20 h-20 rounded-lg border border-border overflow-hidden group relative shrink-0">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => saveMockupToGallery(img, idx)} disabled={savingMockup === idx || isNew} className="p-1 bg-card rounded shadow">
                                {savingMockup === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                              </button>
                              <button onClick={() => setGeneratedMockups(prev => prev.filter((_, i) => i !== idx))} className="p-1 bg-destructive text-destructive-foreground rounded shadow"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* Variants */}
              <SectionCard>
                <SectionHeader icon={Layers} title="Variants" subtitle="Size, color, material options" />
                <DynamicVariantSelector
                  variantOptions={variantOptions}
                  selectedVariants={selectedVariantMap}
                  onChangeVariants={setSelectedVariantMap}
                  productImage={editing.image}
                  designCustomizations={(editing.detail_content as Record<string, unknown>)?.design_customizations as Record<string, "full" | "simple"> ?? {}}
                  onDesignCustomizationsChange={(m) => setEditing(e => ({
                    ...e,
                    detail_content: { ...((e.detail_content as Record<string, unknown>) ?? {}), design_customizations: m },
                  }))}
                />
                <Separator />
                <VariantPricingSection productId={editing.id || null} isNew={isNew && !editing.id} basePrice={editing.price}
                  selectedVariants={selectedVariantMap} variantOptions={variantOptions} />
              </SectionCard>

              {/* Customisation */}
              <CustomisationConfigSection
                modes={((editing.detail_content as Record<string, unknown>)?.customization_modes ?? []) as string[]}
                onModesChange={(m) => setEditing(e => ({
                  ...e,
                  detail_content: { ...((e.detail_content as Record<string, unknown>) ?? {}), customization_modes: m },
                }))}
                assignedTemplateIds={((editing.detail_content as Record<string, unknown>)?.assigned_template_ids ?? []) as string[]}
                onAssignedTemplateIdsChange={(ids) => setEditing(e => ({
                  ...e,
                  detail_content: { ...((e.detail_content as Record<string, unknown>) ?? {}), assigned_template_ids: ids },
                }))}
              />
            </div>

            {/* RIGHT COLUMN (1/3) */}
            <div className="space-y-4">

              {/* Category */}
              <SectionCard>
                <SectionHeader icon={Tag} title="Category" />
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <Select value={editing.category || "_none"} onValueChange={v => setEditing({ ...editing, category: v === "_none" ? "" : v, subcategory: "" })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{parentCategories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {subcats.length > 0 && (
                  <div>
                    <FieldLabel>Sub Category</FieldLabel>
                    <Select value={editing.subcategory || "_none"} onValueChange={v => setEditing({ ...editing, subcategory: v === "_none" ? "" : v })}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select sub category" /></SelectTrigger>
                      <SelectContent>{subcats.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </SectionCard>

              {/* Pricing */}
              <SectionCard>
                <SectionHeader icon={DollarSign} title="Pricing" />
                <div className="grid grid-cols-2 gap-2">
                  <div><FieldLabel hint="Selling">Price (₹)</FieldLabel>
                    <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} className="h-9 text-sm font-semibold" /></div>
                  <div><FieldLabel hint="Strikethrough">Compare (₹)</FieldLabel>
                    <Input type="number" value={editing.original_price} onChange={(e) => setEditing({ ...editing, original_price: Number(e.target.value) })} className="h-9 text-sm" /></div>
                </div>
                {discount > 0 && <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[10px]">{discount}% OFF — saves ₹{editing.original_price - editing.price}</Badge>}
                <div className="grid grid-cols-2 gap-2">
                  <div><FieldLabel hint="At checkout">Shipping (₹)</FieldLabel>
                    <Input type="number" value={editing.shipping_charge} onChange={(e) => setEditing({ ...editing, shipping_charge: Number(e.target.value) })} className="h-9 text-xs" /></div>
                  <div><FieldLabel hint="GST">HSN Code</FieldLabel>
                    <Input value={editing.hsn_code || ""} onChange={(e) => setEditing({ ...editing, hsn_code: e.target.value || null })} placeholder="4911" className="h-9 text-xs" /></div>
                </div>
              </SectionCard>

              {/* Inventory */}
              <SectionCard>
                <div className="flex items-center justify-between">
                  <SectionHeader icon={Package} title="Inventory" />
                  <Switch checked={editing.track_inventory} onCheckedChange={v => setEditing({ ...editing, track_inventory: v })} />
                </div>
                {editing.track_inventory && (
                  <div>
                    <Input type="number" value={editing.inventory_count} onChange={(e) => setEditing({ ...editing, inventory_count: Number(e.target.value) })} className="h-9 text-sm font-semibold" placeholder="Qty" />
                    {editing.inventory_count <= 0 && <p className="text-[10px] text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Out of stock</p>}
                    {editing.inventory_count > 0 && editing.inventory_count <= 5 && <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Low stock</p>}
                  </div>
                )}
              </SectionCard>

              {/* Specs */}
              <SectionCard>
                <SectionHeader icon={Settings} title="Specs" />
                <div>
                  <FieldLabel>Printing</FieldLabel>
                  <Select value={editing.printing} onValueChange={v => setEditing({ ...editing, printing: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{variantOptions.filter(v => v.variant_type === "printing").map(v => <SelectItem key={v.id} value={v.value}>{v.value}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Finish</FieldLabel>
                  <Select value={editing.finish} onValueChange={v => setEditing({ ...editing, finish: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{variantOptions.filter(v => v.variant_type === "finish").map(v => <SelectItem key={v.id} value={v.value}>{v.value}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><FieldLabel>Delivery Time</FieldLabel>
                  <Input value={editing.delivery_time} onChange={(e) => setEditing({ ...editing, delivery_time: e.target.value })} placeholder="5-7 Business Days" className="h-9 text-xs" /></div>
                <div><FieldLabel>Video URL</FieldLabel>
                  <Input value={editing.video || ""} onChange={(e) => setEditing({ ...editing, video: e.target.value || null })} placeholder="https://youtube.com/..." className="h-9 text-xs" /></div>
              </SectionCard>

              {/* SEO */}
              <SectionCard>
                <SectionHeader icon={Tag} title="SEO" />
                <div><FieldLabel hint={`${(editing.meta_title || "").length}/60`}>Meta Title</FieldLabel>
                  <Input value={editing.meta_title || ""} onChange={(e) => setEditing({ ...editing, meta_title: e.target.value })} placeholder={editing.name || "Meta title"} maxLength={60} className="h-9 text-xs" /></div>
                <div><FieldLabel hint={`${(editing.meta_description || "").length}/160`}>Meta Description</FieldLabel>
                  <textarea value={editing.meta_description || ""} onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })} maxLength={160}
                    placeholder="Meta description" className="w-full rounded-lg border border-border bg-background p-2 text-xs min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring resize-y" /></div>
              </SectionCard>

              {/* Tags */}
              <SectionCard>
                <SectionHeader icon={Tag} title="Tags" />
                {editing.tags && editing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editing.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px] gap-1 rounded-full pr-1">
                        {tag}
                        <button onClick={() => setEditing({ ...editing, tags: editing.tags!.filter(t => t !== tag) })} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Input value={tagInput}
                    onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
                    onFocus={() => setShowTagSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); addTag(tagInput.replace(/,$/, "")); }
                      if (e.key === "Backspace" && !tagInput && editing.tags?.length) setEditing({ ...editing, tags: editing.tags.slice(0, -1) });
                    }}
                    placeholder="Type a tag…" className="h-8 text-xs" />
                  {showTagSuggestions && (() => {
                    const currentTags = editing.tags || [];
                    const filtered = allTags.filter(t => !currentTags.includes(t) && (tagInput ? t.toLowerCase().includes(tagInput.toLowerCase()) : true)).slice(0, 8);
                    if (!filtered.length) return null;
                    return (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto py-0.5">
                        {filtered.map(tag => (
                          <button key={tag} type="button" onMouseDown={(e) => { e.preventDefault(); addTag(tag); }}
                            className="w-full text-left px-3 py-1 text-[10px] hover:bg-muted transition-colors">{tag}</button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </SectionCard>

              {/* Collections */}
              {collections.length > 0 && (
                <SectionCard>
                  <SectionHeader icon={Layers} title="Collections" />
                  <div className="space-y-1">
                    {collections.map(col => (
                      <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-muted/50 transition-colors">
                        <Checkbox checked={productCollectionIds.includes(col.id)} onCheckedChange={() => toggleCollection(col.id)} />
                        {col.name}
                      </label>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Options */}
              <SectionCard>
                <SectionHeader icon={Settings} title="Options" />
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium">Customizable</span>
                  <Checkbox checked={editing.customizable} onCheckedChange={(v) => setEditing({ ...editing, customizable: !!v, customizer_mode: v ? (editing.customizer_mode || "full") : "none" })} />
                </label>

                {editing.customizable && (
                  <>
                    <div>
                      <FieldLabel hint="How customers personalize">Customizer Mode</FieldLabel>
                      <div className="grid grid-cols-2 gap-1.5 mt-1">
                        {[
                          { value: "full", label: "Full Canvas", icon: "🎨" },
                          { value: "simple-image", label: "Photo Upload", icon: "📷" },
                          { value: "simple-text", label: "Text Input", icon: "✏️" },
                          { value: "simple-both", label: "Photo + Text", icon: "📷✏️" },
                        ].map(mode => {
                          const currentMode = editing.customizer_mode || "full";
                          const isActive = currentMode === mode.value;
                          return (
                            <button key={mode.value} type="button"
                              onClick={() => setEditing({ ...editing, customizer_mode: mode.value })}
                              className={`text-left p-2 rounded-lg border-2 transition-all text-[10px] ${isActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/30"}`}>
                              <span>{mode.icon}</span> <span className={`font-medium ${isActive ? "text-primary" : ""}`}>{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      {(editing.customizer_mode === "simple-image" || editing.customizer_mode === "simple-both") && (
                        <div><FieldLabel>📷 Image Upload Label</FieldLabel>
                          <Input className="h-8 text-xs" value={editing.simple_image_label || "Upload Your Photo"} onChange={(e) => setEditing({ ...editing, simple_image_label: e.target.value })} /></div>
                      )}
                      {(editing.customizer_mode === "simple-text" || editing.customizer_mode === "simple-both") && (
                        <div><FieldLabel>✏️ Text Field Label</FieldLabel>
                          <Input className="h-8 text-xs" value={editing.simple_text_label || "Enter Your Text"} onChange={(e) => setEditing({ ...editing, simple_text_label: e.target.value })} /></div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="w-12 h-12 rounded-lg border border-dashed border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0 cursor-pointer"
                          onClick={() => customizerFileInputRef.current?.click()}>
                          {editing.customizer_image ? <img src={editing.customizer_image} alt="" className="w-full h-full object-cover" /> :
                            <Wand2 className="w-4 h-4 text-muted-foreground/30" />}
                        </div>
                        <div className="flex-1">
                          <Input value={editing.customizer_image || ""} onChange={(e) => setEditing({ ...editing, customizer_image: e.target.value })} placeholder="Customizer bg image URL" className="h-7 text-[10px]" />
                        </div>
                      </div>
                      <input ref={customizerFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleCustomizerImageUpload(e.target.files[0]); e.target.value = ""; }} />
                    </div>
                  </>
                )}

                <Separator />
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs">Free Gift</span>
                  <Switch checked={editing.is_free_gift} onCheckedChange={v => setEditing({ ...editing, is_free_gift: v })} />
                </label>
              </SectionCard>
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: TEMPLATE ═══ */}
        <TabsContent value="template" className="mt-0">
          <ProductTemplateEditor
            template={editing.detail_template || null}
            content={(editing.detail_content as any) || {}}
            onTemplateChange={(t) => setEditing({ ...editing, detail_template: t })}
            onContentChange={(c) => setEditing({ ...editing, detail_content: c })}
            productName={editing.name}
            productImage={editing.image}
            productImages={productImages.map(img => img.image_url)}
            productFeatures={editing.features || []}
            productDescription={editing.description}
            productCategory={editing.category}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── CustomisationConfigSection ─────────────────────────────── */
function CustomisationConfigSection({
  modes, onModesChange, assignedTemplateIds, onAssignedTemplateIdsChange,
}: {
  modes: string[];
  onModesChange: (m: string[]) => void;
  assignedTemplateIds: string[];
  onAssignedTemplateIdsChange: (ids: string[]) => void;
}) {
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loadingTmpl, setLoadingTmpl] = useState(false);
  const [tmplSearch, setTmplSearch] = useState("");
  const hasTemplate = modes.includes("template");

  useEffect(() => {
    if (hasTemplate && templates.length === 0) {
      setLoadingTmpl(true);
      adminGet<DesignTemplate[]>("/design-templates", []).then(data => {
        setTemplates(Array.isArray(data) ? data : []);
        setLoadingTmpl(false);
      });
    }
  }, [hasTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMode = (key: string) => {
    onModesChange(modes.includes(key) ? modes.filter(m => m !== key) : [...modes, key]);
  };

  const toggleTemplate = (id: string) => {
    onAssignedTemplateIdsChange(
      assignedTemplateIds.includes(id)
        ? assignedTemplateIds.filter(t => t !== id)
        : [...assignedTemplateIds, id],
    );
  };

  const filtered = templates.filter(t =>
    t.label.toLowerCase().includes(tmplSearch.toLowerCase()) ||
    (t.category ?? "").toLowerCase().includes(tmplSearch.toLowerCase()),
  );

  return (
    <SectionCard>
      <SectionHeader icon={Settings} title="Customisation" subtitle="Which ways customers can personalise this product" />

      {/* Mode toggles — 2×2 grid */}
      <div className="grid grid-cols-2 gap-2">
        {CUST_MODES.map(({ key, icon, label, hint }) => {
          const active = modes.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleMode(key)}
              className={`flex items-start gap-2 rounded-lg border-2 p-2.5 text-left transition-all ${
                active ? "border-primary bg-primary/5" : "border-border/50 bg-muted/10 hover:border-primary/30"
              }`}
            >
              <span className="text-base shrink-0 mt-0.5">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-semibold ${active ? "text-primary" : "text-foreground"}`}>{label}</div>
                <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">{hint}</div>
              </div>
              <div className={`shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                active ? "border-primary bg-primary" : "border-border/60"
              }`}>
                {active && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
              </div>
            </button>
          );
        })}
      </div>

      {modes.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60 italic">
          No modes selected — this product cannot be customised.
        </p>
      )}

      {/* Template picker — shown only when template mode is ON */}
      {hasTemplate && (
        <div className="space-y-2 pt-1 border-t border-border/40">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold">Assign templates to this product</p>
            {assignedTemplateIds.length > 0 && (
              <span className="text-[9px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {assignedTemplateIds.length} assigned
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={tmplSearch}
              onChange={e => setTmplSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full h-7 rounded-md border border-border/50 bg-background pl-7 pr-2.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
            />
          </div>

          {loadingTmpl ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading templates…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">
              {tmplSearch ? "No matches." : "No templates yet — create them in the Design Templates tab."}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-0.5">
              {filtered.map(tmpl => {
                const isAssigned = assignedTemplateIds.includes(tmpl.id);
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => toggleTemplate(tmpl.id)}
                    className={`relative rounded-lg border-2 overflow-hidden text-left transition-all ${
                      isAssigned ? "border-primary shadow-sm" : "border-border/50 hover:border-primary/40"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="h-16 bg-muted/60 flex items-center justify-center overflow-hidden">
                      {tmpl.thumbnail ? (
                        <img src={tmpl.thumbnail} alt={tmpl.label} className="h-full w-full object-cover" />
                      ) : (
                        <LayoutTemplate className="w-6 h-6 text-muted-foreground/30" />
                      )}
                    </div>
                    {/* Label + category */}
                    <div className="p-1.5">
                      <p className="text-[10px] font-medium leading-tight truncate">{tmpl.label}</p>
                      {tmpl.category && (
                        <span className={`inline-block mt-0.5 text-[9px] rounded-full px-1.5 ${tmplCatBadge(tmpl.category)}`}>
                          {tmpl.category}
                        </span>
                      )}
                    </div>
                    {/* Selected checkmark overlay */}
                    {isAssigned && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary shadow flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                    {/* Active indicator */}
                    {!tmpl.is_active && (
                      <div className="absolute top-1 left-1 text-[8px] bg-muted text-muted-foreground rounded px-1">off</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* ── DynamicVariantSelector ──────────────────────────────────── */
const VARIANT_TYPE_LABELS: Record<string, string> = {
  size: "Size", color: "Color", material: "Material", finish: "Finish",
  printing: "Printing", design: "Design", style: "Style", weight: "Weight",
};

function DynamicVariantSelector({
  variantOptions: initialOptions,
  selectedVariants,
  onChangeVariants,
  productImage,
  designCustomizations = {},
  onDesignCustomizationsChange,
}: {
  variantOptions: VariantOption[];
  selectedVariants: Record<string, string[]>;
  onChangeVariants: (v: Record<string, string[]>) => void;
  productImage?: string;
  designCustomizations?: Record<string, "full" | "simple">;
  onDesignCustomizationsChange?: (m: Record<string, "full" | "simple">) => void;
}) {
  const [localOptions, setLocalOptions] = useState<VariantOption[]>(initialOptions);
  useEffect(() => { setLocalOptions(initialOptions); }, [initialOptions]);

  // Per-type value search
  const [valueSearch, setValueSearch] = useState<Record<string, string>>({});
  const [valueDropOpen, setValueDropOpen] = useState<Record<string, boolean>>({});
  const [addingValue, setAddingValue] = useState<Record<string, boolean>>({});

  // Type-level search
  const [typeSearch, setTypeSearch] = useState("");
  const [typeDropOpen, setTypeDropOpen] = useState(false);

  // Per-design customisation mode picker ("type::value" key or null)
  const [custPickerOpen, setCustPickerOpen] = useState<string | null>(null);

  const availableTypes = useMemo(
    () => Array.from(new Set(localOptions.map(v => v.variant_type))),
    [localOptions],
  );
  const activeTypes = Object.keys(selectedVariants);

  const addType = (type: string) => {
    const t = type.trim().toLowerCase().replace(/\s+/g, "_");
    if (!t || activeTypes.includes(t)) return;
    onChangeVariants({ ...selectedVariants, [t]: [] });
    setTypeSearch("");
    setTypeDropOpen(false);
  };

  const removeType = (type: string) => {
    const next = { ...selectedVariants };
    delete next[type];
    onChangeVariants(next);
  };

  const toggleOption = (type: string, value: string) => {
    const current = selectedVariants[type] || [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    onChangeVariants({ ...selectedVariants, [type]: next });
  };

  const handleAddNewOption = async (type: string, rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setAddingValue(a => ({ ...a, [type]: true }));
    try {
      const base = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
      const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
      const res = await fetch(`${base}/api/product-variant-options/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ variant_type: type, value, is_active: true }),
      });
      if (res.ok) {
        const created = await res.json() as VariantOption;
        setLocalOptions(opts => [...opts, created]);
        toggleOption(type, value);
        setValueSearch(s => ({ ...s, [type]: "" }));
        setValueDropOpen(o => ({ ...o, [type]: false }));
      }
    } finally {
      setAddingValue(a => ({ ...a, [type]: false }));
    }
  };

  const setDesignMode = (designValue: string, mode: "full" | "simple") => {
    onDesignCustomizationsChange?.({ ...designCustomizations, [designValue]: mode });
    setCustPickerOpen(null);
  };

  // Type-level dropdown
  const typeQueryLower = typeSearch.toLowerCase().trim();
  const unusedTypes = availableTypes.filter(t => !activeTypes.includes(t));
  const filteredTypes = typeQueryLower
    ? unusedTypes.filter(t => t.toLowerCase().includes(typeQueryLower) || (VARIANT_TYPE_LABELS[t] ?? "").toLowerCase().includes(typeQueryLower))
    : unusedTypes;
  const typeAlreadyActive = activeTypes.some(t => t.toLowerCase() === typeQueryLower);
  const typeExistsInDB = availableTypes.some(t => t.toLowerCase() === typeQueryLower);
  const canCreateType = typeQueryLower.length > 0 && !typeAlreadyActive && !typeExistsInDB;

  return (
    <div className="space-y-3">
      {/* ── Active type sections ── */}
      {activeTypes.map(type => {
        const isDesign = type === "design";
        const typeOptions = localOptions.filter(v => v.variant_type === type);
        const selected = selectedVariants[type] || [];
        const label = VARIANT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
        const search = valueSearch[type] ?? "";
        const searchLower = search.toLowerCase();
        const filteredOpts = search
          ? typeOptions.filter(o => o.value.toLowerCase().includes(searchLower))
          : typeOptions;
        const exactMatch = typeOptions.some(o => o.value.toLowerCase() === searchLower);
        const showAddBtn = search.trim().length > 0 && !exactMatch;

        return (
          <div key={type} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {isDesign && productImage && (
                  <img src={productImage} alt="" className="w-5 h-5 rounded object-cover border border-border/40" />
                )}
                <h4 className="text-xs font-semibold capitalize">{label}</h4>
                {selected.length > 0 && (
                  <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    {selected.length} selected
                  </span>
                )}
              </div>
              <button type="button" onClick={() => removeType(type)}
                className="text-muted-foreground/60 hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map(val => {
                  const colorHex = type === "color" ? val.split("|")[1] : null;
                  const colorName = type === "color" ? val.split("|")[0] : null;
                  const custMode = designCustomizations[val];
                  const chipKey = `${type}::${val}`;
                  return (
                    <div key={val} className="relative">
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border-2 border-primary bg-primary/10 text-primary">
                        {isDesign && productImage && (
                          <img src={productImage} alt="" className="w-4 h-4 rounded object-cover border border-primary/30 shrink-0" />
                        )}
                        {colorHex && (
                          <span className="w-3 h-3 rounded-full border border-border shrink-0" style={{ backgroundColor: colorHex }} />
                        )}
                        <span>{colorName ?? val}</span>
                        {/* Per-design customisation mode badge */}
                        {isDesign && (
                          <button
                            type="button"
                            title="Set customisation mode for this design"
                            onClick={() => setCustPickerOpen(custPickerOpen === chipKey ? null : chipKey)}
                            className={`ml-0.5 rounded px-1 text-[9px] font-bold transition-colors ${
                              custMode === "full"   ? "bg-violet-500 text-white" :
                              custMode === "simple" ? "bg-sky-500 text-white" :
                              "bg-muted text-muted-foreground hover:bg-primary/20"
                            }`}
                          >
                            {custMode ?? "mode"}
                          </button>
                        )}
                        <button type="button" onClick={() => toggleOption(type, val)}
                          className="ml-0.5 opacity-50 hover:opacity-100 hover:text-destructive transition-colors">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* Customisation picker popover */}
                      {isDesign && custPickerOpen === chipKey && (
                        <div className="absolute bottom-full left-0 mb-1 z-50 bg-popover border border-border/70 rounded-lg shadow-lg p-2 space-y-1 min-w-[155px]">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">Customisation mode</p>
                          {(["full", "simple"] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setDesignMode(val, mode)}
                              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
                                custMode === mode
                                  ? "bg-primary text-white font-medium"
                                  : "hover:bg-muted text-foreground"
                              }`}
                            >
                              {mode === "full" ? "🎨" : "✏️"}
                              <span className="capitalize">{mode} customisation</span>
                              {custMode === mode && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const next = { ...designCustomizations };
                              delete next[val];
                              onDesignCustomizationsChange?.(next);
                              setCustPickerOpen(null);
                            }}
                            className="w-full text-[10px] text-muted-foreground hover:text-destructive px-2 py-1 text-left transition-colors"
                          >
                            Clear mode
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Value search input + dropdown */}
            <div className="relative">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={search}
                  onChange={e => {
                    setValueSearch(s => ({ ...s, [type]: e.target.value }));
                    setValueDropOpen(o => ({ ...o, [type]: true }));
                  }}
                  onFocus={() => setValueDropOpen(o => ({ ...o, [type]: true }))}
                  onBlur={() => setTimeout(() => setValueDropOpen(o => ({ ...o, [type]: false })), 160)}
                  placeholder={`Search ${label.toLowerCase()} values…`}
                  className="flex-1 h-7 rounded-md border border-border/50 bg-background px-2.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                />
                {showAddBtn && (
                  <button
                    type="button"
                    onMouseDown={() => handleAddNewOption(type, search)}
                    disabled={addingValue[type]}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-white text-[10px] font-medium disabled:opacity-50 hover:bg-primary/90 shrink-0"
                  >
                    {addingValue[type] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                )}
              </div>

              {/* Suggestion list */}
              {valueDropOpen[type] && (search ? filteredOpts.length > 0 : typeOptions.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border/60 rounded-lg shadow-md overflow-hidden max-h-44 overflow-y-auto">
                  {(search ? filteredOpts : typeOptions).map(opt => {
                    const isSel = selected.includes(opt.value);
                    const cHex = type === "color" ? opt.value.split("|")[1] : null;
                    const cName = type === "color" ? opt.value.split("|")[0] : null;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onMouseDown={() => {
                          toggleOption(type, opt.value);
                          setValueSearch(s => ({ ...s, [type]: "" }));
                          setValueDropOpen(o => ({ ...o, [type]: false }));
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-muted transition-colors ${isSel ? "text-primary font-medium bg-primary/5" : "text-foreground"}`}
                      >
                        {isDesign && productImage && (
                          <img src={productImage} alt="" className="w-5 h-5 rounded object-cover border border-border/30 shrink-0" />
                        )}
                        {cHex && <span className="w-4 h-4 rounded-full border border-border shrink-0" style={{ backgroundColor: cHex }} />}
                        <span className="flex-1 text-left">{cName ?? opt.value}</span>
                        {isSel && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {valueDropOpen[type] && search && filteredOpts.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border/60 rounded-lg shadow-sm px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    No match — click <strong>Add</strong> to create &ldquo;{search}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Add variant type search row ── */}
      <div className="relative">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={typeSearch}
              onChange={e => { setTypeSearch(e.target.value); setTypeDropOpen(true); }}
              onFocus={() => setTypeDropOpen(true)}
              onBlur={() => setTimeout(() => setTypeDropOpen(false), 160)}
              placeholder="Add variant type (size, color, design…)"
              className="w-full h-9 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 bg-muted/10 px-3 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
            />
            <Plus className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          {canCreateType && (
            <button
              type="button"
              onMouseDown={() => addType(typeSearch)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create type
            </button>
          )}
        </div>

        {typeDropOpen && (typeQueryLower ? filteredTypes : unusedTypes).length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border/60 rounded-lg shadow-md overflow-hidden max-h-40 overflow-y-auto">
            {(typeQueryLower ? filteredTypes : unusedTypes).map(type => (
              <button
                key={type}
                type="button"
                onMouseDown={() => addType(type)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted text-foreground transition-colors"
              >
                <Plus className="w-3 h-3 text-muted-foreground" />
                <span className="capitalize">{VARIANT_TYPE_LABELS[type] ?? type.replace(/_/g, " ")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}