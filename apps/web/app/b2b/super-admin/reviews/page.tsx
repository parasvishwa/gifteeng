"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Loader2, Star, Save, X, Upload, Camera,
  CheckCircle, XCircle, FileSpreadsheet, RefreshCw, Pencil,
  Search, ThumbsUp, Image as ImageIcon, Film, Sparkles,
} from "lucide-react";
import {
  toast,
  Button, Input, Switch, Label, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";
const loadXLSX = () => import("xlsx");

interface Review {
  id: string;
  product_id: string;
  name: string;
  rating: number;
  text: string;
  date_label: string;
  image_url: string | null;
  video_url: string | null;
  helpful: number;
  verified: boolean;
  is_active: boolean;
  sort_order: number;
}
interface CustomerPhoto { id: string; image_url: string; is_active: boolean; sort_order: number; }

// Upload a file (image or video) to POST /api/files/upload and return the URL
async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${getApiBase()}/api/files/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!r.ok) throw new Error('Upload failed');
  const data = await r.json();
  // Support common response shapes: { url }, { fileUrl }, { path }, { data: { url } }
  return data?.url ?? data?.fileUrl ?? data?.path ?? data?.data?.url ?? URL.createObjectURL(file);
}

// ─── Sentiment Gauge SVG ──────────────────────────────────────
function SentimentGauge({ score }: { score: number }) {
  // Semicircle SVG: 0=left (red), 100=right (green)
  const r = 60;
  const cx = 80;
  const cy = 80;
  const circumference = Math.PI * r; // half circle
  const filled = (score / 100) * circumference;
  // Color: red < 40, yellow 40-70, green > 70
  const color = score < 40 ? "#ef4444" : score < 70 ? "#f59e0b" : "#22c55e";

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="90" viewBox="0 0 160 90">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" className="font-bold" style={{ fontSize: 26, fill: color, fontWeight: 700 }}>
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 10, fill: "#9ca3af" }}>
          / 100
        </text>
      </svg>
      <p className="text-xs font-semibold mt-1" style={{ color }}>
        {score < 40 ? "Needs Improvement" : score < 70 ? "Average" : "Excellent"}
      </p>
    </div>
  );
}

// ─── Sentiment Analysis Panel ─────────────────────────────────
function SentimentPanel({ reviews }: { reviews: { name: string; rating: number; text: string }[] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    positives: string[];
    negatives: string[];
    urgent: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!reviews.length) return;
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
      const context = JSON.stringify(
        reviews.slice(0, 80).map(r => ({ rating: r.rating, text: r.text.slice(0, 200) }))
      );
      const res = await fetch(`${getApiBase()}/api/admin/ai/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: `Analyze these customer reviews and give: 1) Overall sentiment score 0-100, 2) Top 3 positive themes, 3) Top 3 negative themes, 4) Urgently fix: one thing. Reply in JSON: {score: number, positives: [string, string, string], negatives: [string, string, string], urgent: string}`,
          context,
        }),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as { text?: string };
      const text = data.text ?? "";
      const match = text.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error("Could not parse AI response");
      const parsed = JSON.parse(match[0]);
      setResult({
        score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
        positives: Array.isArray(parsed.positives) ? parsed.positives.slice(0, 3) : [],
        negatives: Array.isArray(parsed.negatives) ? parsed.negatives.slice(0, 3) : [],
        urgent: parsed.urgent ?? "",
      });
    } catch (e) {
      setError((e as Error).message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-primary/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/30 bg-primary/5 flex items-center justify-between">
        <p className="text-sm font-semibold text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> ✨ Sentiment Analysis
        </p>
        {reviews.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
            onClick={analyze}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? "Analyzing..." : "Analyze All Reviews"}
          </Button>
        )}
      </div>

      <div className="p-4">
        {reviews.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No approved reviews to analyze yet.</p>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-3">{error}</div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Analyzing {reviews.length} reviews with AI...</p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            {/* Score gauge + themes grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              {/* Gauge */}
              <div className="flex justify-center">
                <SentimentGauge score={result.score} />
              </div>

              {/* Positive themes */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-2">Top Positives</p>
                <div className="flex flex-col gap-1.5">
                  {result.positives.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                      ✓ {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Negative themes */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-2">Top Negatives</p>
                <div className="flex flex-col gap-1.5">
                  {result.negatives.map((n, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                      ✗ {n}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Urgent action */}
            {result.urgent && (
              <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2">
                <span className="text-lg shrink-0">🚨</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 mb-0.5">Urgent Action Required</p>
                  <p className="text-sm text-red-800 dark:text-red-300 font-medium">{result.urgent}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {!result && !loading && !error && reviews.length > 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Click "Analyze All Reviews" to get AI-powered sentiment insights.
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminReviews() {
  const reviewImageRef = useRef<HTMLInputElement>(null);
  const reviewVideoRef = useRef<HTMLInputElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);
  const excelUploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [bulkReviews, setBulkReviews] = useState<any[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProduct, setFilterProduct] = useState("all");
  const [fetchingReviewsFor, setFetchingReviewsFor] = useState<string | null>(null);
  const [amazonProductId, setAmazonProductId] = useState("");
  const [bulkProductId, setBulkProductId] = useState("");

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [photos, setPhotos] = useState<CustomerPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [products, setProducts] = useState<{ id: string; name: string; amazon_asin: string | null }[]>([]);

  const [reviewSettings, setReviewSettings] = useState({
    overall_rating: 4.7,
    total_reviews: 1567,
    breakdown: [
      { stars: 5, percent: 68 }, { stars: 4, percent: 20 }, { stars: 3, percent: 7 },
      { stars: 2, percent: 3 }, { stars: 1, percent: 2 },
    ],
  });

  const refreshReviews = async () => {
    const data = await safeGet<Review[]>("/reviews/admin", []);
    setReviews(Array.isArray(data) ? data : []);
    setLoadingReviews(false);
  };
  const refreshPhotos = async () => {
    const data = await safeGet<CustomerPhoto[]>("/customer-photos", []);
    setPhotos(Array.isArray(data) ? data : []);
    setLoadingPhotos(false);
  };
  const refreshProducts = async () => {
    // Admin endpoint — drafts + b2c-disabled rows included.
    const data = await safeGet<{ items?: any[] } | any[]>("/products/admin/list?pageSize=200&page=1", []);
    const items: any[] = Array.isArray(data) ? data : ((data as any)?.items ?? []);
    setProducts(items.map((p: any) => ({
      id: p.id ?? "",
      name: (p.name ?? p.title ?? "").toString(),
      amazon_asin: p.amazon_asin ?? p.amazonAsin ?? null,
    })));
  };
  const refreshSettings = async () => {
    const data = await safeGet<any>("/site-settings/review_settings", null);
    if (data) setReviewSettings(data);
  };

  useEffect(() => {
    refreshReviews();
    refreshPhotos();
    refreshProducts();
    refreshSettings();
  }, []);

  const pendingReviews = reviews.filter(r => !r.is_active);
  const approvedReviews = reviews.filter(r => r.is_active);
  const amazonProducts = products.filter(p => p.amazon_asin);

  const filteredApproved = useMemo(() => {
    let list = approvedReviews;
    if (filterProduct !== "all") list = list.filter(r => r.product_id === filterProduct);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.text.toLowerCase().includes(q));
    }
    return list;
  }, [approvedReviews, filterProduct, search]);

  const getProductName = (pid: string) => products.find(p => p.id === pid)?.name || "General";
  const avgRating = approvedReviews.length
    ? (approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length).toFixed(1)
    : "0";

  const saveReview = async (review: Review) => {
    const { id, ...rest } = review;
    if (isNew) {
      await safePost("/reviews", rest, null);
    } else {
      await safePatch(`/reviews/admin/${id}`, rest, null);
    }
    await refreshReviews();
    setEditingReview(null);
    setIsNew(false);
    toast({ title: isNew ? "Review added!" : "Review updated!" });
  };

  const deleteReview = async (id: string) => {
    await safeDelete(`/reviews/admin/${id}`, null);
    await refreshReviews();
    toast({ title: "Deleted" });
  };

  const approveReview = async (id: string) => {
    await safePost(`/reviews/admin/${id}/approve`, {}, null);
    await refreshReviews();
    toast({ title: "Approved!" });
  };

  const rejectReview = async (id: string) => {
    await safeDelete(`/reviews/admin/${id}`, null);
    await refreshReviews();
    toast({ title: "Rejected" });
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadFile(file);
      await safePost("/customer-photos", { image_url: url, sort_order: photos.length }, null);
      await refreshPhotos();
      toast({ title: "Photo uploaded!" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const deletePhoto = async (photo: CustomerPhoto) => {
    await safeDelete(`/customer-photos/${photo.id}`, null);
    await refreshPhotos();
    toast({ title: "Deleted" });
  };

  const saveSettings = async () => {
    await safePost("/site-settings/review_settings", reviewSettings, null);
    toast({ title: "Settings saved!" });
  };

  const bulkUpload = async () => {
    setBulkUploading(true);
    try {
      await safePost("/reviews/bulk", { rows: bulkReviews }, null);
      await refreshReviews();
      toast({ title: `${bulkReviews.length} reviews uploaded!` });
      setBulkReviews([]);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBulkUploading(false); }
  };

  const fetchAmazonReviews = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product?.amazon_asin) { toast({ title: "No ASIN linked", variant: "destructive" }); return; }
    setFetchingReviewsFor(productId);
    try {
      const sourceUrl = `https://www.amazon.in/dp/${product.amazon_asin}`;
      const data = await safePost<{ drafts?: any[]; importResult?: { count?: number }; error?: string }>(
        "/amazon-reviews/import",
        { productId, sourceUrl },
        { drafts: [] },
      );
      const count = data?.importResult?.count ?? data?.drafts?.length ?? 0;
      toast({ title: `Imported ${count} reviews` });
      await refreshReviews();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setFetchingReviewsFor(null); }
  };

  const handleReviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingReview) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setEditingReview({ ...editingReview, image_url: url });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleReviewVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingReview) return;
    setUploadingVideo(true);
    try {
      const url = await uploadFile(file);
      // Immediately patch video_url on existing reviews so it is not lost on cancel
      if (!isNew && editingReview.id) {
        await safePatch(`/reviews/admin/${editingReview.id}`, { video_url: url }, null);
      }
      setEditingReview({ ...editingReview, video_url: url });
      toast({ title: "Video uploaded!" });
    } catch (err: any) {
      toast({ title: "Video upload failed", description: err.message, variant: "destructive" });
    }
    setUploadingVideo(false);
    e.target.value = "";
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      const mapped = json.map((row, i) => ({
        name: String(row.name || row.Name || ""),
        rating: Number(row.rating || row.Rating || 5),
        text: String(row.text || row.Text || row.review || row.Review || ""),
        product_id: bulkProductId || String(row.product_id || row.ProductId || ""),
        date_label: String(row.date_label || row.Date || "Recently"),
        verified: row.verified === true || row.verified === "true" || true,
        helpful: Number(row.helpful || 0),
        is_active: true,
        sort_order: i,
      })).filter(r => r.name && r.text);
      setBulkReviews(mapped);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX();
    const sample = products.slice(0, 3).map((p, i) => ({
      name: ["John Doe", "Jane Smith", "Alex"][i],
      rating: [5, 4, 5][i],
      text: ["Amazing!", "Very good quality", "Highly recommended"][i],
      product_id: p.id,
      product_name: p.name,
      date_label: "2 days ago",
      verified: true,
      helpful: [12, 5, 8][i],
    }));
    if (!sample.length) sample.push({
      name: "John Doe", rating: 5, text: "Amazing!",
      product_id: "", product_name: "", date_label: "2 days ago", verified: true, helpful: 12,
    });
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reviews");
    if (products.length) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(products.map(p => ({ product_id: p.id, product_name: p.name }))),
        "Product IDs",
      );
    }
    XLSX.writeFile(wb, "reviews-template.xlsx");
  };

  const newReview: Review = {
    id: "",
    product_id: products[0]?.id || "",
    name: "",
    rating: 5,
    text: "",
    date_label: "Just now",
    image_url: null,
    video_url: null,
    helpful: 0,
    verified: true,
    is_active: true,
    sort_order: reviews.length,
  };

  // ---- Edit Modal ----
  if (editingReview) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-bold">{isNew ? "Add Review" : "Edit Review"}</h2>
          <button
            onClick={() => { setEditingReview(null); setIsNew(false); }}
            className="p-1.5 rounded-lg hover:bg-muted"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="p-4 space-y-3">
            {/* Product */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Product</Label>
              <Select
                value={editingReview.product_id || "_global"}
                onValueChange={v => setEditingReview({ ...editingReview, product_id: v === "_global" ? "" : v })}
              >
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_global">Global (all products)</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Reviewer Name *</Label>
                <Input
                  value={editingReview.name}
                  onChange={e => setEditingReview({ ...editingReview, name: e.target.value })}
                  className="h-9 text-sm mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Date Label</Label>
                <Input
                  value={editingReview.date_label}
                  onChange={e => setEditingReview({ ...editingReview, date_label: e.target.value })}
                  placeholder="8 days ago"
                  className="h-9 text-sm mt-1"
                />
              </div>
            </div>

            {/* Rating */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Rating</Label>
              <div className="flex gap-1.5 mt-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditingReview({ ...editingReview, rating: s })}
                    className="p-0.5 rounded hover:bg-muted transition-colors"
                  >
                    <Star
                      className={`w-6 h-6 transition-colors ${
                        s <= editingReview.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Review Text */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Review Text *</Label>
              <textarea
                value={editingReview.text}
                onChange={e => setEditingReview({ ...editingReview, text: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Image Upload */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Image</Label>
              <div className="flex items-center gap-3 mt-1">
                {editingReview.image_url ? (
                  <div className="relative group">
                    <img
                      src={editingReview.image_url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover border border-border/40"
                    />
                    <button
                      onClick={() => setEditingReview({ ...editingReview, image_url: null })}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                <button
                  onClick={() => reviewImageRef.current?.click()}
                  disabled={uploading}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                  title="Upload image"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </button>
                <input
                  ref={reviewImageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReviewImageUpload}
                />
              </div>
            </div>

            {/* Video Upload */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Video</Label>
              <div className="flex items-center gap-3 mt-1">
                {editingReview.video_url ? (
                  <div className="relative group">
                    <video
                      src={editingReview.video_url}
                      className="w-24 h-16 rounded-lg object-cover border border-border/40 bg-black"
                      muted
                      playsInline
                    />
                    <button
                      onClick={() => setEditingReview({ ...editingReview, video_url: null })}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                <button
                  onClick={() => reviewVideoRef.current?.click()}
                  disabled={uploadingVideo}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors gap-1"
                  title="Upload video"
                >
                  {uploadingVideo
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Film className="w-4 h-4" />
                  }
                  <span className="text-[9px]">Video</span>
                </button>
                <input
                  ref={reviewVideoRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleReviewVideoUpload}
                />
                {!editingReview.video_url && (
                  <p className="text-[10px] text-muted-foreground">
                    Upload a short video review (mp4, mov, etc.)
                  </p>
                )}
              </div>
            </div>

            {/* Helpful + Sort */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Helpful count</Label>
                <Input
                  type="number"
                  value={String(editingReview.helpful)}
                  onChange={e => setEditingReview({ ...editingReview, helpful: Number(e.target.value) })}
                  className="h-9 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Sort Order</Label>
                <Input
                  type="number"
                  value={String(editingReview.sort_order)}
                  onChange={e => setEditingReview({ ...editingReview, sort_order: Number(e.target.value) })}
                  className="h-9 text-sm mt-1"
                />
              </div>
            </div>

            {/* Verified + Published */}
            <div className="flex items-center gap-5 pt-1">
              <label className="flex items-center gap-2">
                <Switch
                  checked={editingReview.verified}
                  onCheckedChange={v => setEditingReview({ ...editingReview, verified: v })}
                />
                <span className="text-xs">Verified</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={editingReview.is_active}
                  onCheckedChange={v => setEditingReview({ ...editingReview, is_active: v })}
                />
                <span className="text-xs">Published</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/30 bg-muted/10">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setEditingReview(null); setIsNew(false); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveReview(editingReview)}
              disabled={!editingReview.name || !editingReview.text}
              className="gap-1.5 h-8 text-xs"
            >
              <Save className="w-3.5 h-3.5" /> {isNew ? "Add Review" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main list view ----
  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Reviews</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {avgRating}
              </span>
              <span>·</span>
              <span>{approvedReviews.length} approved</span>
              {pendingReviews.length > 0 && (
                <>
                  <span>·</span>
                  <Badge
                    variant="secondary"
                    className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20"
                  >
                    {pendingReviews.length} pending
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 h-8 text-xs"
          onClick={() => { setEditingReview(newReview); setIsNew(true); }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Review
        </Button>
      </div>

      <SentimentPanel reviews={approvedReviews.map(r => ({ name: r.name, rating: r.rating, text: r.text }))} />

      <Tabs defaultValue={pendingReviews.length > 0 ? "pending" : "reviews"}>
        <TabsList className="h-9">
          <TabsTrigger value="reviews" className="text-xs gap-1.5 px-3">
            <Star className="w-3 h-3" /> Reviews
          </TabsTrigger>
          {pendingReviews.length > 0 && (
            <TabsTrigger value="pending" className="text-xs gap-1.5 px-3">
              <CheckCircle className="w-3 h-3" /> Pending
              <Badge variant="secondary" className="text-[8px] h-3.5 px-1 ml-0.5">
                {pendingReviews.length}
              </Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="photos" className="text-xs gap-1.5 px-3">
            <Camera className="w-3 h-3" /> Photos
          </TabsTrigger>
          <TabsTrigger value="bulk" className="text-xs gap-1.5 px-3">
            <FileSpreadsheet className="w-3 h-3" /> Import
          </TabsTrigger>
        </TabsList>

        {/* ---- Reviews tab ---- */}
        <TabsContent value="reviews" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search reviews..."
                className="h-8 text-xs pl-8"
              />
            </div>
            <Select value={filterProduct} onValueChange={setFilterProduct}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {amazonProducts.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <Select value={amazonProductId} onValueChange={setAmazonProductId}>
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue placeholder="Amazon fetch" />
                  </SelectTrigger>
                  <SelectContent>
                    {amazonProducts.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name.substring(0, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 px-2.5"
                  disabled={!amazonProductId || fetchingReviewsFor !== null}
                  onClick={() => amazonProductId && fetchAmazonReviews(amazonProductId)}
                >
                  {fetchingReviewsFor
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <RefreshCw className="w-3 h-3" />
                  }
                  Fetch
                </Button>
              </div>
            )}
          </div>

          {loadingReviews ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredApproved.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
              <Star className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-medium mb-1">
                {search || filterProduct !== "all" ? "No reviews match" : "No reviews yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {search || filterProduct !== "all"
                  ? "Try different filters"
                  : "Add reviews manually or import from Amazon"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredApproved.map(r => (
                <div
                  key={r.id}
                  className="bg-card rounded-xl border border-border/40 p-3 group hover:border-border/60 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {r.image_url && (
                      <img
                        src={r.image_url}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border/30"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs">{r.name}</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i < r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
                            />
                          ))}
                        </div>
                        {r.verified && (
                          <Badge
                            variant="secondary"
                            className="text-[8px] h-3.5 px-1 bg-blue-500/10 text-blue-600 border-blue-500/20"
                          >
                            Verified
                          </Badge>
                        )}
                        {/* Video indicator */}
                        {r.video_url && (
                          <span title="Has video" className="text-primary">
                            <Film className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {r.helpful > 0 && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                            <ThumbsUp className="w-2.5 h-2.5" /> {r.helpful}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{r.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-muted-foreground/60">{r.date_label}</span>
                        <span className="text-[9px] text-muted-foreground/40">·</span>
                        <span className="text-[9px] text-muted-foreground/60 truncate">
                          {getProductName(r.product_id)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingReview(r); setIsNew(false); }}
                        className="p-1.5 hover:bg-muted rounded-lg"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete?")) deleteReview(r.id); }}
                        className="p-1.5 hover:bg-destructive/10 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Pending tab ---- */}
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingReviews.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500/30 mx-auto mb-2" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground">No pending reviews to moderate</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingReviews.map(r => (
                <div key={r.id} className="bg-card rounded-xl border border-amber-500/20 p-3">
                  <div className="flex items-start gap-3">
                    {r.image_url && (
                      <img src={r.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs">{r.name}</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i < r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
                            />
                          ))}
                        </div>
                        {r.verified && (
                          <Badge
                            variant="secondary"
                            className="text-[8px] h-3.5 px-1 bg-blue-500/10 text-blue-600 border-blue-500/20"
                          >
                            Verified
                          </Badge>
                        )}
                        {r.video_url && (
                          <span title="Has video" className="text-primary">
                            <Film className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{r.text}</p>
                      <span className="text-[9px] text-muted-foreground/60">
                        {getProductName(r.product_id)} · {r.date_label}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-border/30">
                    <Button
                      size="sm"
                      className="flex-1 gap-1 text-xs h-7"
                      onClick={() => approveReview(r.id)}
                    >
                      <CheckCircle className="w-3 h-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 gap-1 text-xs h-7"
                      onClick={() => rejectReview(r.id)}
                    >
                      <XCircle className="w-3 h-3" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-7 px-2"
                      onClick={() => { setEditingReview(r); setIsNew(false); }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Photos tab ---- */}
        <TabsContent value="photos" className="space-y-3 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">{photos.length} customer photos</p>
            <Button
              size="sm"
              onClick={() => photoUploadRef.current?.click()}
              disabled={uploading}
              className="gap-1.5 text-xs h-8"
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              Upload Photo
            </Button>
            <input
              ref={photoUploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0]); e.target.value = ""; }}
            />
          </div>

          {loadingPhotos ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : photos.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
              <ImageIcon className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-medium mb-1">No photos yet</p>
              <p className="text-xs text-muted-foreground">Upload customer photos to display on your store</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {photos.map(p => (
                <div
                  key={p.id}
                  className="relative group aspect-square rounded-xl overflow-hidden border border-border/30"
                >
                  <img
                    src={p.image_url}
                    alt=""
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <button
                      onClick={() => { if (confirm("Delete?")) deletePhoto(p); }}
                      className="w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Bulk Import tab ---- */}
        <TabsContent value="bulk" className="space-y-4 mt-4">
          <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
              <h3 className="text-xs font-semibold flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" /> Bulk Upload via Excel
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Columns:{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                  name, rating, text, product_id, date_label, verified, helpful
                </code>
              </p>
              <div>
                <Label className="text-[11px] text-muted-foreground mb-1 block">Assign to product</Label>
                <Select
                  value={bulkProductId || "_file"}
                  onValueChange={v => setBulkProductId(v === "_file" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_file">Use product_id from file</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => excelUploadRef.current?.click()}
                  className="gap-1.5 text-xs h-8"
                >
                  <Upload className="w-3 h-3" /> Select File
                </Button>
                <input
                  ref={excelUploadRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                  className="gap-1.5 text-xs h-8"
                >
                  <FileSpreadsheet className="w-3 h-3" /> Template
                </Button>
              </div>

              {bulkReviews.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">{bulkReviews.length} reviews parsed</p>
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setBulkReviews([])}
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-xs h-7"
                        onClick={() => bulkUpload()}
                        disabled={bulkUploading}
                      >
                        {bulkUploading
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Upload className="w-3 h-3" />
                        }
                        Upload All
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {bulkReviews.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/20 rounded-lg text-xs"
                      >
                        <span className="text-muted-foreground/50 w-4 shrink-0 text-right">{i + 1}</span>
                        <span className="font-medium truncate flex-1">{r.name}</span>
                        <div className="flex gap-0.5 shrink-0">
                          {[...Array(5)].map((_, si) => (
                            <Star
                              key={si}
                              className={`w-2.5 h-2.5 ${si < r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => setBulkReviews(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-0.5 text-destructive shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
              <h3 className="text-xs font-semibold">Review Badge Settings</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Overall Rating</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={String(reviewSettings.overall_rating)}
                    onChange={e => setReviewSettings({ ...reviewSettings, overall_rating: Number(e.target.value) })}
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Total Reviews</Label>
                  <Input
                    type="number"
                    value={String(reviewSettings.total_reviews)}
                    onChange={e => setReviewSettings({ ...reviewSettings, total_reviews: Number(e.target.value) })}
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground">Rating Breakdown</Label>
                <div className="space-y-1.5 mt-1.5">
                  {reviewSettings.breakdown.map((b, i) => (
                    <div key={b.stars} className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 w-8 shrink-0">
                        <span className="text-xs font-medium">{b.stars}</span>
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      </div>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full transition-all"
                          style={{ width: `${b.percent}%` }}
                        />
                      </div>
                      <Input
                        type="number"
                        value={String(b.percent)}
                        onChange={e => {
                          const n = [...reviewSettings.breakdown];
                          n[i] = { ...b, percent: Number(e.target.value) };
                          setReviewSettings({ ...reviewSettings, breakdown: n });
                        }}
                        className="w-14 h-7 text-xs shrink-0 text-center"
                      />
                      <span className="text-[10px] text-muted-foreground">%</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button size="sm" onClick={() => saveSettings()} className="gap-1.5 text-xs h-8">
                <Save className="w-3.5 h-3.5" /> Save Settings
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}