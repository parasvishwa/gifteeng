"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getB2cToken } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function getB2bToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("gifteeng.b2b.token") ??
    sessionStorage.getItem("gifteeng.b2b.token")
  );
}

interface B2bProduct {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  images?: { url: string; alt?: string }[];
  mockupTemplates?: { customizerImage?: string; maskPos?: { x: number; y: number; w: number; h: number } }[];
  isCustomizable?: boolean;
}

interface MockupResult {
  productId: string;
  productTitle: string;
  productImage: string;
  previewDataUrl: string;
  canvasJSON: string;
}

// ─── Logo + text compositor ────────────────────────────────────────────────────
async function compositeLogoOnProduct(
  logoUrl: string,
  productImgUrl: string,
  companyName: string,
  tagline: string,
  logoPosition: "top-left" | "center" | "bottom-center",
): Promise<string> {
  const W = 400;
  const H = 400;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Draw product base
  try {
    const prodImg = new window.Image();
    prodImg.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      prodImg.onload = () => res();
      prodImg.onerror = () => rej();
      prodImg.src = productImgUrl;
    });
    ctx.drawImage(prodImg, 0, 0, W, H);
  } catch {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay position
  const LOGO_SIZE = W * 0.22;
  let lx = 0;
  let ly = 0;
  if (logoPosition === "top-left") { lx = 16; ly = 16; }
  else if (logoPosition === "center") { lx = (W - LOGO_SIZE) / 2; ly = (H - LOGO_SIZE) / 2; }
  else { lx = (W - LOGO_SIZE) / 2; ly = H - LOGO_SIZE - 16; }

  // Draw logo with white backing circle
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(lx + LOGO_SIZE / 2, ly + LOGO_SIZE / 2, LOGO_SIZE / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.restore();

  try {
    const logoImg = new window.Image();
    logoImg.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      logoImg.onload = () => res();
      logoImg.onerror = () => rej();
      logoImg.src = logoUrl;
    });
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx + LOGO_SIZE / 2, ly + LOGO_SIZE / 2, LOGO_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, lx, ly, LOGO_SIZE, LOGO_SIZE);
    ctx.restore();
  } catch {/* skip logo */}

  // Company name & tagline
  if (companyName) {
    const textY = logoPosition === "bottom-center" ? ly - 30 : ly + LOGO_SIZE + 20;
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 18px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(companyName, W / 2, textY);
    if (tagline) {
      ctx.fillStyle = "#555";
      ctx.font = "13px 'Outfit', sans-serif";
      ctx.fillText(tagline, W / 2, textY + 22);
    }
  }

  return canvas.toDataURL("image/png");
}

function buildCanvasJSON(
  logoUrl: string,
  productImgUrl: string,
  companyName: string,
  tagline: string,
): string {
  return JSON.stringify({
    version: "6.0.0",
    objects: [
      { type: "Image", src: productImgUrl, left: 200, top: 200, originX: "center", originY: "center", selectable: false, evented: false },
      { type: "Image", src: logoUrl, left: 200, top: 140, originX: "center", originY: "center", scaleX: 0.3, scaleY: 0.3 },
      ...(companyName ? [{ type: "FabricText", text: companyName, left: 200, top: 260, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: "bold", fill: "#1a1a1a", textAlign: "center" }] : []),
      ...(tagline ? [{ type: "FabricText", text: tagline, left: 200, top: 286, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 13, fill: "#555", textAlign: "center" }] : []),
    ],
    background: "",
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BulkCustomizerPage() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoPosition, setLogoPosition] = useState<"top-left" | "center" | "bottom-center">("bottom-center");

  const [products, setProducts] = useState<B2bProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [productsLoading, setProductsLoading] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<MockupResult[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const fileRef = useRef<HTMLInputElement>(null);

  // Load company products
  useEffect(() => {
    const token = getB2bToken();
    if (!token) { setProductsLoading(false); return; }
    fetch(`${API}/api/products?b2b=true&pageSize=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: B2bProduct[] }) => {
        setProducts(data.items ?? []);
        setProductsLoading(false);
      })
      .catch(() => setProductsLoading(false));
  }, []);

  // Upload logo
  const handleLogoFile = useCallback(async (file: File) => {
    setLogoFile(file);
    const local = URL.createObjectURL(file);
    setLogoUrl(local);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/api/files/upload`, {
        method: "POST",
        body: fd,
        headers: { Authorization: `Bearer ${getB2bToken() ?? ""}` },
      });
      if (r.ok) {
        const d = (await r.json()) as { url?: string };
        if (d.url) setLogoUrl(d.url);
      }
    } catch {/* keep local */}
    setLogoUploading(false);
  }, []);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAll = () => setSelectedIds(new Set(products.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // Generate mockups
  const generateMockups = useCallback(async () => {
    if (!logoUrl || selectedIds.size === 0) return;
    setGenerating(true);
    setResults([]);

    const selected = products.filter((p) => selectedIds.has(p.id));
    const out: MockupResult[] = [];

    for (const p of selected) {
      const productImg =
        p.mockupTemplates?.[0]?.customizerImage ??
        p.images?.[0]?.url ??
        "";

      const previewDataUrl = await compositeLogoOnProduct(
        logoUrl,
        productImg,
        companyName,
        tagline,
        logoPosition,
      );

      const canvasJSON = buildCanvasJSON(logoUrl, productImg, companyName, tagline);

      out.push({
        productId: p.id,
        productTitle: p.title,
        productImage: productImg,
        previewDataUrl,
        canvasJSON,
      });
    }

    setResults(out);
    setStep(3);
    setGenerating(false);
  }, [logoUrl, selectedIds, products, companyName, tagline, logoPosition]);

  // Download all previews as a ZIP (simple: open each in a new tab)
  const downloadAll = () => {
    results.forEach((r) => {
      const a = document.createElement("a");
      a.href = r.previewDataUrl;
      a.download = `${r.productTitle.replace(/\s+/g, "-")}-branded.png`;
      a.click();
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="section-tag">B2B Feature</div>
        <h1 className="section-heading mt-1">Bulk Logo Customizer</h1>
        <p className="section-subtitle">
          Upload your company logo and instantly brand all your gifting products in one click.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-4 mb-8">
        {([
          { n: 1, label: "Upload Logo" },
          { n: 2, label: "Select Products" },
          { n: 3, label: "Download Mockups" },
        ] as const).map(({ n, label }) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step > n ? "bg-green-500 text-white" :
              step === n ? "bg-primary text-white shadow-lg" :
              "bg-muted text-muted-foreground"
            }`}>
              {step > n ? "✓" : n}
            </div>
            <span className={`text-sm font-medium ${step === n ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {n < 3 && <div className={`flex-1 h-0.5 ${step > n ? "bg-green-500" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Upload Logo ── */}
      {step === 1 && (
        <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f?.type.startsWith("image/")) void handleLogoFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className={`cursor-pointer rounded-3xl border-2 border-dashed p-12 text-center transition-all hover:bg-primary/5 ${
              logoUrl ? "border-green-400 bg-green-50" : "border-primary/30 hover:border-primary"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleLogoFile(f);
              }}
            />
            {logoUrl ? (
              <div className="space-y-3">
                <div className="mx-auto h-24 w-24 rounded-2xl overflow-hidden border-4 border-white shadow-xl bg-white relative">
                  <Image src={logoUrl} alt="Logo" fill className="object-contain p-1" />
                </div>
                <p className="text-green-600 font-medium">Logo uploaded! ✓</p>
                <p className="text-sm text-muted-foreground">Tap to change</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-4xl">🏢</span>
                </div>
                <div>
                  <p className="text-lg font-semibold">Upload your company logo</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    PNG with transparent background works best
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Company name (optional)</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                maxLength={40}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Tagline (optional)</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Gifting Made Memorable"
                maxLength={60}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Logo position on product</label>
              <div className="grid grid-cols-3 gap-2">
                {(["top-left", "center", "bottom-center"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setLogoPosition(pos)}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all capitalize ${
                      logoPosition === pos
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {pos === "top-left" ? "↖ Top Left" : pos === "center" ? "⊕ Center" : "↓ Bottom"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            disabled={!logoUrl || logoUploading}
            onClick={() => setStep(2)}
            className="w-full btn-primary py-3.5 text-base disabled:opacity-40"
          >
            {logoUploading ? "Uploading…" : "Next: Select Products →"}
          </button>
        </div>
      )}

      {/* ── STEP 2: Select Products ── */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedIds.size} of {products.length} products selected
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-sm text-primary underline">Select all</button>
              <span className="text-muted-foreground">·</span>
              <button onClick={deselectAll} className="text-sm text-muted-foreground underline">Deselect all</button>
            </div>
          </div>

          {productsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-3">📦</p>
              <p>No B2B products found. Contact your administrator to enable products.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {products.map((p) => {
                const img = p.images?.[0]?.url ?? "";
                const selected = selectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={`relative rounded-2xl border-2 overflow-hidden text-left transition-all ${
                      selected
                        ? "border-primary shadow-md"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="aspect-square bg-muted relative">
                      {img && (
                        <Image src={img} alt={p.title} fill className="object-cover" />
                      )}
                      {selected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                            ✓
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold line-clamp-2">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">₹{p.basePrice}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(1)} className="px-6 py-3 rounded-full border text-sm font-medium">
              ← Back
            </button>
            <button
              disabled={selectedIds.size === 0 || generating}
              onClick={generateMockups}
              className="flex-1 btn-primary py-3 text-base disabled:opacity-40"
            >
              {generating
                ? `Generating mockups… (${results.length}/${selectedIds.size})`
                : `Generate ${selectedIds.size} Branded Mockup${selectedIds.size !== 1 ? "s" : ""} →`}
            </button>
          </div>

          {generating && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
                <p className="text-sm">Applying your branding to each product…</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${selectedIds.size > 0 ? (results.length / selectedIds.size) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Results ── */}
      {step === 3 && results.length > 0 && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                {results.length} Branded Mockups Ready! 🎉
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your logo has been applied to all selected products
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setStep(1); setResults([]); }}
                className="px-4 py-2 rounded-full border text-sm"
              >
                Start over
              </button>
              <button
                onClick={downloadAll}
                className="btn-primary px-5 py-2 text-sm"
              >
                Download All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {results.map((r) => (
              <div key={r.productId} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="aspect-square relative bg-muted">
                  <Image
                    src={r.previewDataUrl}
                    alt={r.productTitle}
                    fill
                    className="object-contain"
                  />
                </div>
                <div className="p-3">
                  <p className="text-xs font-semibold line-clamp-2">{r.productTitle}</p>
                  <a
                    href={r.previewDataUrl}
                    download={`${r.productTitle.replace(/\s+/g, "-")}-branded.png`}
                    className="mt-2 block text-center text-xs text-primary underline"
                  >
                    Download PNG
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-semibold text-amber-800">📋 What to do with these mockups?</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-700 list-disc list-inside">
              <li>Share with your team via your internal catalog</li>
              <li>Download and send to printing vendor for bulk orders</li>
              <li>Attach to your campaign for employee gifting</li>
              <li>Upload to your company product library</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
