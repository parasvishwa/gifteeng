"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, X, Check, Eye, EyeOff, Plus, Wand2, Image as ImageIcon, GripVertical, Trash2, Sparkles, ImagePlus } from "lucide-react";
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Badge } from "@gifteeng/ui";
import { useToast } from "@gifteeng/ui";


// ── Stub AI invoke (was supabase.functions.invoke) ─────────────
// TODO: wire to /api/ai/* endpoints
async function aiInvoke(_fn: string, _body: any): Promise<{ data: any; error: any }> {
  return { data: { success: false }, error: new Error("AI not wired") };
}

const TEMPLATES = [
  { id: "minimal", name: "Minimal Clean", description: "White space, elegant typography", icon: "◻" },
  { id: "story", name: "Story-driven", description: "Narrative with lifestyle images", icon: "📖" },
  { id: "luxury", name: "Premium Luxury", description: "Dark theme, gold accents", icon: "✦" },
  { id: "bold", name: "Bold & Vibrant", description: "Large hero, bright accents", icon: "🔥" },
  { id: "editorial", name: "Editorial", description: "Magazine-style layout", icon: "📰" },
];

interface TemplateContent {
  hero_image?: string;
  hero_title?: string;
  hero_subtitle?: string;
  sections?: { image?: string; title?: string; text?: string }[];
  feature_title?: string;
  features_list?: string[];
  cta_text?: string;
  cta_subtext?: string;
}

interface Props {
  template: string | null;
  content: TemplateContent;
  onTemplateChange: (t: string | null) => void;
  onContentChange: (c: TemplateContent) => void;
  productName: string;
  productImage: string;
  productImages?: string[];
  productFeatures?: string[];
  productDescription?: string;
  productCategory?: string;
}

function AiBtn({ field, context, currentValue, onResult }: {
  field: string; context?: Record<string, any>; currentValue?: string; onResult: (v: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const go = async () => {
    setLoading(true);
    try {
      const { data, error } = await aiInvoke("ai-write", { field, context, current_value: currentValue });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed");
      onResult(data.content);
      toast({ title: "✨ AI content generated!" });
    } catch (err: any) {
      toast({ title: "AI failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };
  return (
    <button type="button" onClick={go} disabled={loading}
      className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium disabled:opacity-50 shrink-0">
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
      {loading ? "Writing..." : "Write with AI"}
    </button>
  );
}

function AiImageBtn({ prompt, sourceImage, onResult, label }: {
  prompt: string; sourceImage?: string; onResult: (url: string) => void; label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const go = async () => {
    setLoading(true);
    try {
      const { data, error } = await aiInvoke("generate-image", {
        prompt, source_image_url: sourceImage, mode: sourceImage ? "mockup" : "generate",
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.imageUrl) {
        onResult(data.imageUrl);
        toast({ title: "✨ Image generated!" });
      }
    } catch (err: any) {
      toast({ title: "Image generation failed", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };
  return (
    <button type="button" onClick={go} disabled={loading}
      className="inline-flex items-center gap-1.5 text-[10px] text-primary hover:text-primary/80 font-medium disabled:opacity-50 shrink-0 bg-primary/5 hover:bg-primary/10 px-2.5 py-1.5 rounded-full transition-colors">
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
      {loading ? "Generating..." : label || "Generate with AI"}
    </button>
  );
}

function ImageDropZone({ image, onUpload, onUrlChange, uploading, className = "", label }: {
  image?: string; onUpload: (file: File) => void; onUrlChange: (url: string) => void;
  uploading: boolean; className?: string; label?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) onUpload(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed overflow-hidden cursor-pointer transition-all group
          ${dragOver ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/40"}
          ${className || "w-full aspect-[16/9]"}`}
      >
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : image ? (
          <>
            <img src={image} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg">
                Click or drop to replace
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8 mb-2" />
            <p className="text-xs font-medium">{label || "Drop image here"}</p>
            <p className="text-[10px] mt-0.5">or click to upload • any size adapts automatically</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ""; }} />
      </div>
      <Input
        value={image || ""}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="Or paste image URL..."
        className="h-8 text-[11px]"
      />
    </div>
  );
}

export default function ProductTemplateEditor({
  template, content, onTemplateChange, onContentChange,
  productName, productImage, productImages = [], productFeatures = [],
  productDescription = "", productCategory = ""
}: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const { toast } = useToast();

  const aiContext = { name: productName, image: productImage, category: productCategory };
  const allImages = [productImage, ...productImages].filter(Boolean);
  const primarySourceImage = allImages[0] || "";

  const uploadImage = async (file: File, target: string) => {
    setUploading(target);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      const formData = new FormData();
      formData.append("file", file);
      // TODO: wire to /api/files/upload — return public URL
      const res = await fetch(`${base}/api/files/upload`, { method: "POST", body: formData });
      const json = res.ok ? await res.json() : null;
      const url = json?.url || "";
      if (url) {
        applyImageUrl(target, url);
        toast({ title: "Image uploaded!" });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(null);
  };

  const applyImageUrl = (target: string, url: string) => {
    if (target === "hero_image") {
      onContentChange({ ...content, hero_image: url });
    } else if (target.startsWith("section_")) {
      const idx = parseInt(target.split("_")[1]);
      const sections = [...(content.sections || [])];
      while (sections.length <= idx) sections.push({});
      sections[idx] = { ...sections[idx], image: url };
      onContentChange({ ...content, sections });
    }
  };

  const updateSection = (idx: number, field: string, value: string) => {
    const sections = [...(content.sections || [])];
    while (sections.length <= idx) sections.push({});
    sections[idx] = { ...sections[idx], [field]: value };
    onContentChange({ ...content, sections });
  };

  const addSection = () => onContentChange({ ...content, sections: [...(content.sections || []), {}] });
  const removeSection = (idx: number) => {
    const sections = [...(content.sections || [])];
    sections.splice(idx, 1);
    onContentChange({ ...content, sections });
  };

  const generateAllContent = async () => {
    if (!primarySourceImage && !productName) {
      toast({ title: "Add a product image or name first", variant: "destructive" });
      return;
    }
    setGeneratingAll(true);
    try {
      // TODO: wire to /api/ai/generate-template
      toast({ title: "AI not wired yet" });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }
    setGeneratingAll(false);
  };

  return (
    <div className="space-y-5">
      {/* ── Template Selector ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Choose a Template</CardTitle>
          <p className="text-xs text-muted-foreground">Select a layout for this product's detail page</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <button onClick={() => onTemplateChange(null)}
              className={`relative rounded-xl border-2 p-3 text-center transition-all hover:border-primary/50 ${!template ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"}`}>
              {!template && <div className="absolute top-1.5 right-1.5"><Check className="w-3.5 h-3.5 text-primary" /></div>}
              <div className="text-xl mb-1">🔧</div>
              <p className="text-[10px] font-semibold">Default</p>
            </button>
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => onTemplateChange(t.id)}
                className={`relative rounded-xl border-2 p-3 text-center transition-all hover:border-primary/50 ${template === t.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"}`}>
                {template === t.id && <div className="absolute top-1.5 right-1.5"><Check className="w-3.5 h-3.5 text-primary" /></div>}
                <div className="text-xl mb-1">{t.icon}</div>
                <p className="text-[10px] font-semibold">{t.name}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Content Editor ── */}
      {template && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button onClick={generateAllContent} disabled={generatingAll} variant="default"
              size="sm" className="gap-2 text-xs rounded-full shadow-md shadow-primary/20">
              {generatingAll ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating all content…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Generate All with AI</>
              )}
            </Button>
            <Button variant={showPreview ? "default" : "outline"} size="sm" className="gap-1.5 text-xs"
              onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPreview ? "Hide Preview" : "Live Preview"}
            </Button>
          </div>

          {allImages.length > 0 && (
            <div className="bg-muted/30 rounded-xl border border-border/40 px-4 py-3 flex items-center gap-3">
              <div className="flex -space-x-2">
                {allImages.slice(0, 4).map((img, i) => (
                  <img key={i} src={img} alt="" className="w-8 h-8 rounded-lg border-2 border-background object-cover" />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{allImages.length}</span> product image{allImages.length > 1 ? "s" : ""} available for AI generation
              </p>
            </div>
          )}

          {generatingAll && (
            <div className="bg-primary/5 border border-primary/15 rounded-xl px-5 py-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary">Generating template content…</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Creating hero image, 3 section images, text content & features. This takes 30-60 seconds.</p>
              </div>
            </div>
          )}

          <div className={showPreview ? "grid grid-cols-1 xl:grid-cols-2 gap-6" : ""}>
            <div className="space-y-4">
              {/* Hero */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">🖼 Hero Section</p>
                    {primarySourceImage && (
                      <AiImageBtn
                        prompt={`Create a stunning wide hero banner for a product page. Product: ${productName}. Category: ${productCategory}. Cinematic, elegant, professional.`}
                        sourceImage={primarySourceImage}
                        onResult={(url) => onContentChange({ ...content, hero_image: url })}
                        label="Generate Hero"
                      />
                    )}
                  </div>
                  <ImageDropZone
                    image={content.hero_image || productImage}
                    onUpload={(f) => uploadImage(f, "hero_image")}
                    onUrlChange={(url) => onContentChange({ ...content, hero_image: url })}
                    uploading={uploading === "hero_image"}
                    className="w-full aspect-[16/9]"
                    label="Drop hero image here"
                  />
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Hero Title</Label>
                      <AiBtn field="hero_title" context={aiContext} currentValue={content.hero_title} onResult={(v) => onContentChange({ ...content, hero_title: v })} />
                    </div>
                    <Input value={content.hero_title || ""} onChange={(e) => onContentChange({ ...content, hero_title: e.target.value })} placeholder={productName || "Your headline here"} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Subtitle</Label>
                      <AiBtn field="hero_subtitle" context={aiContext} currentValue={content.hero_subtitle} onResult={(v) => onContentChange({ ...content, hero_subtitle: v })} />
                    </div>
                    <Input value={content.hero_subtitle || ""} onChange={(e) => onContentChange({ ...content, hero_subtitle: e.target.value })} placeholder="A short tagline" />
                  </div>
                </CardContent>
              </Card>

              {/* Content Sections */}
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">📄 Content Sections</p>
                    <Button variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={addSection}>
                      <Plus className="w-3 h-3" /> Add Section
                    </Button>
                  </div>

                  {(content.sections || []).map((section, idx) => (
                    <div key={idx} className="bg-muted/20 rounded-xl p-4 border border-border/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Section {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          {allImages.length > 0 && (
                            <AiImageBtn
                              prompt={`Create a lifestyle scene showing this product. ${section.title ? `Theme: ${section.title}.` : ""} Product: ${productName}. Make it look natural and aspirational.`}
                              sourceImage={allImages[idx % allImages.length]}
                              onResult={(url) => updateSection(idx, "image", url)}
                              label="AI Image"
                            />
                          )}
                          <button onClick={() => removeSection(idx)} className="p-1 hover:bg-destructive/10 rounded-lg text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <ImageDropZone
                        image={section.image}
                        onUpload={(f) => uploadImage(f, `section_${idx}`)}
                        onUrlChange={(url) => updateSection(idx, "image", url)}
                        uploading={uploading === `section_${idx}`}
                        className="w-full aspect-[4/3]"
                        label="Drop section image"
                      />

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">Title</Label>
                          <AiBtn field="section_title" context={{ ...aiContext, sectionIndex: idx }}
                            currentValue={section.title} onResult={(v) => updateSection(idx, "title", v)} />
                        </div>
                        <Input value={section.title || ""} onChange={(e) => updateSection(idx, "title", e.target.value)} placeholder="Section title" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">Text</Label>
                          <AiBtn field="section_text" context={{ ...aiContext, sectionTitle: section.title, description: productDescription?.slice(0, 200), features: productFeatures }}
                            currentValue={section.text} onResult={(v) => updateSection(idx, "text", v)} />
                        </div>
                        <textarea value={section.text || ""} onChange={(e) => updateSection(idx, "text", e.target.value)}
                          className="w-full rounded-lg border border-border bg-background p-2.5 text-sm min-h-[70px]" placeholder="Section content..." />
                      </div>
                    </div>
                  ))}

                  {(!content.sections || content.sections.length === 0) && (
                    <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                      <p className="text-xs text-muted-foreground">No sections yet. Add one or use "Generate All with AI" above.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Features */}
              <Card>
                <CardContent className="pt-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">✅ Features Highlight</p>
                  {productFeatures.length > 0 && (!content.features_list || content.features_list.length === 0) && (
                    <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2 border border-border/40">
                      <p className="text-[10px] text-muted-foreground flex-1">
                        {productFeatures.length} features from product data available
                      </p>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-full gap-1 px-2"
                        onClick={() => onContentChange({ ...content, features_list: [...productFeatures] })}>
                        <Plus className="w-2.5 h-2.5" /> Use Product Features
                      </Button>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Section Title</Label>
                      <AiBtn field="feature_title" context={aiContext} currentValue={content.feature_title}
                        onResult={(v) => onContentChange({ ...content, feature_title: v })} />
                    </div>
                    <Input value={content.feature_title || ""} onChange={(e) => onContentChange({ ...content, feature_title: e.target.value })} placeholder="Why choose this product?" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">Features (comma-separated)</Label>
                      <AiBtn field="features_list" context={{ ...aiContext, features: productFeatures, description: productDescription?.slice(0, 200) }}
                        currentValue={(content.features_list || []).join(", ")}
                        onResult={(v) => onContentChange({ ...content, features_list: v.split(",").map(s => s.trim()).filter(Boolean) })} />
                    </div>
                    <Input value={(content.features_list || []).join(", ")}
                      onChange={(e) => onContentChange({ ...content, features_list: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                      placeholder="Premium quality, Handcrafted, Eco-friendly" />
                    {content.features_list && content.features_list.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {content.features_list.map((f, i) => <Badge key={i} variant="secondary" className="text-[10px] rounded-full">✓ {f}</Badge>)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* CTA */}
              <Card>
                <CardContent className="pt-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">🎯 Call to Action</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">CTA Text</Label>
                        <AiBtn field="cta_text" context={aiContext} currentValue={content.cta_text}
                          onResult={(v) => onContentChange({ ...content, cta_text: v })} />
                      </div>
                      <Input value={content.cta_text || ""} onChange={(e) => onContentChange({ ...content, cta_text: e.target.value })} placeholder="Shop Now" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Subtext</Label>
                        <AiBtn field="cta_subtext" context={aiContext} currentValue={content.cta_subtext}
                          onResult={(v) => onContentChange({ ...content, cta_subtext: v })} />
                      </div>
                      <Input value={content.cta_subtext || ""} onChange={(e) => onContentChange({ ...content, cta_subtext: e.target.value })} placeholder="Free shipping" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Live Preview column */}
            {showPreview && (
              <div className="border border-border rounded-2xl overflow-hidden bg-background shadow-lg sticky top-24 max-h-[80vh] overflow-y-auto">
                <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-secondary/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-primary/40" />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium ml-2">Live Preview — {TEMPLATES.find(t => t.id === template)?.name}</p>
                </div>
                <div className="p-3 text-xs text-muted-foreground text-center">
                  {/* TODO: wire ProductDetailTemplate preview */}
                  Live preview not wired yet
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}