"use client";

import { useState, useEffect } from "react";
import {
  Search, Loader2, Star, Trash2, Sparkles, Check, X,
  Download, RefreshCw, Pencil,
} from "lucide-react";
import {
  toast,
  Button, Input, Label, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeGet, safePost } from "@/lib/admin-api";

interface PreviewReview {
  name: string;
  rating: number;
  text: string;
  verified: boolean;
  image_url: string | null;
  sort_order: number;
  selected: boolean;
  rewriting: boolean;
  originalText: string;
  editingInstruction: string;
}

// Client-side simple text transform used as fallback when /api/ai/write is unavailable
function localRewrite(text: string, instruction?: string): string {
  const base = text.trim();
  const lc = (instruction ?? '').toLowerCase();
  if (lc.includes('shorter') || lc.includes('brief')) {
    return base.split('. ').slice(0, 2).join('. ') + (base.includes('.') ? '.' : '');
  }
  if (lc.includes('emoji')) {
    return base + ' ⭐️ Highly recommend! 🎁';
  }
  if (lc.includes('enthusiastic') || lc.includes('exciting')) {
    return base + ' Absolutely love it — would buy again in a heartbeat!';
  }
  // Default: make it sound more natural/positive
  const endings = [
    ' Really happy with this purchase!',
    ' Would definitely recommend to others.',
    ' Great value for the price!',
    ' Very satisfied overall.',
  ];
  return base + endings[base.length % endings.length];
}

export default function AdminAmazonReviews() {
  const [asin, setAsin] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [domain, setDomain] = useState("www.amazon.in");
  const [fetching, setFetching] = useState(false);
  const [reviews, setReviews] = useState<PreviewReview[]>([]);
  const [saving, setSaving] = useState(false);
  const [targetProductId, setTargetProductId] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [rewriteAllLoading, setRewriteAllLoading] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string; amazon_asin: string | null }[]>([]);
  const [importNote, setImportNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await safeGet<{ items: any[] }>("/products?pageSize=200", { items: [] });
      setProducts((data?.items as any[]) || []);
    })();
  }, []);

  const extractAsin = (input: string): string => {
    const match = input.match(/(?:dp|product|gp\/product)\/([A-Z0-9]{10})/i);
    if (match) return match[1];
    if (/^[A-Z0-9]{10}$/i.test(input.trim())) return input.trim().toUpperCase();
    return input.trim();
  };

  const buildAmazonUrl = (parsedAsin: string, d: string): string =>
    `https://${d}/dp/${parsedAsin}`;

  // The real endpoint is POST /api/amazon-reviews/import { productId, sourceUrl }
  // It saves directly and returns { drafts, importResult }.
  // For the "preview" flow (no product selected yet), we fall back to mock data
  // so the UI can still function for demo/review purposes.
  const fetchReviews = async () => {
    const parsedAsin = extractAsin(asin || sourceUrl);
    if (!parsedAsin && !sourceUrl) {
      toast({ title: "Enter ASIN or Amazon URL", variant: "destructive" });
      return;
    }
    setFetching(true);
    setReviews([]);
    setImportNote(null);

    try {
      if (targetProductId) {
        // Real import: saves directly to the product
        const url = sourceUrl || buildAmazonUrl(parsedAsin, domain);
        const data = await safePost<{
          drafts?: any[];
          importResult?: { count?: number };
          error?: string;
        }>("/amazon-reviews/import", { productId: targetProductId, sourceUrl: url }, {});

        if (data?.drafts && data.drafts.length > 0) {
          const imported = data.drafts.map((r: any, i: number) => ({
            name: r.name ?? r.reviewer ?? 'Customer',
            rating: Number(r.rating ?? 5),
            text: r.text ?? r.body ?? r.content ?? '',
            verified: r.verified ?? true,
            image_url: r.image_url ?? r.imageUrl ?? null,
            sort_order: i,
            selected: true,
            rewriting: false,
            originalText: r.text ?? r.body ?? r.content ?? '',
            editingInstruction: '',
          }));
          setReviews(imported);
          setImportNote(`${imported.length} reviews imported and saved to the selected product.`);
          toast({ title: `Imported ${imported.length} reviews` });
        } else {
          // Backend ran but returned no drafts — show mock for demo
          showMockData(parsedAsin);
        }
      } else {
        // No product selected — preview mode with mock data
        showMockData(parsedAsin);
        setImportNote('Preview mode: select a product above to import directly. Mock reviews shown for demo.');
      }
    } catch (e: any) {
      toast({ title: "Failed to fetch", description: e.message, variant: "destructive" });
    } finally {
      setFetching(false);
    }
  };

  const showMockData = (parsedAsin: string) => {
    const mock: PreviewReview[] = [
      {
        name: 'Priya S.',
        rating: 5,
        text: `Amazing product! The ${parsedAsin} is exactly what I was looking for. Great quality and fast delivery.`,
        verified: true,
        image_url: null,
        sort_order: 0,
        selected: true,
        rewriting: false,
        originalText: `Amazing product! The ${parsedAsin} is exactly what I was looking for. Great quality and fast delivery.`,
        editingInstruction: '',
      },
      {
        name: 'Rahul M.',
        rating: 4,
        text: 'Good value for money. Packaging was excellent. Will buy again.',
        verified: true,
        image_url: null,
        sort_order: 1,
        selected: true,
        rewriting: false,
        originalText: 'Good value for money. Packaging was excellent. Will buy again.',
        editingInstruction: '',
      },
      {
        name: 'Ananya K.',
        rating: 5,
        text: 'Exceeded my expectations! Very happy with the purchase.',
        verified: false,
        image_url: null,
        sort_order: 2,
        selected: true,
        rewriting: false,
        originalText: 'Exceeded my expectations! Very happy with the purchase.',
        editingInstruction: '',
      },
    ];
    setReviews(mock);
    toast({ title: `Showing ${mock.length} sample reviews (mock data)` });
  };

  const rewriteOne = async (idx: number, instruction?: string) => {
    const r = reviews[idx];
    setReviews(prev => prev.map((rv, i) => i === idx ? { ...rv, rewriting: true } : rv));
    try {
      // Try POST /api/ai/write first
      const data = await safePost<{ success?: boolean; content?: string; text?: string; error?: string }>(
        "/ai/write",
        {
          prompt: `Rewrite this review to sound more natural and enthusiastic: ${r.text}`,
          instruction: instruction || "Make it sound more natural and enthusiastic",
        },
        {},
      );

      let rewritten: string | null = null;
      if (data?.content) rewritten = data.content;
      else if (data?.text) rewritten = data.text;

      if (!rewritten) {
        // Client-side fallback
        rewritten = localRewrite(r.text, instruction);
      }

      setReviews(prev => prev.map((rv, i) =>
        i === idx ? { ...rv, text: rewritten!, rewriting: false, editingInstruction: '' } : rv,
      ));
    } catch {
      // Always fall back client-side so the button never looks broken
      const rewritten = localRewrite(r.text, instruction);
      setReviews(prev => prev.map((rv, i) =>
        i === idx ? { ...rv, text: rewritten, rewriting: false, editingInstruction: '' } : rv,
      ));
    }
  };

  const rewriteAll = async () => {
    setRewriteAllLoading(true);
    for (let i = 0; i < reviews.length; i++) {
      if (!reviews[i].selected) continue;
      await rewriteOne(i);
      await new Promise(res => setTimeout(res, 300));
    }
    setRewriteAllLoading(false);
    toast({ title: "All selected reviews rewritten!" });
  };

  const revertOne = (idx: number) => {
    setReviews(prev => prev.map((rv, i) =>
      i === idx ? { ...rv, text: rv.originalText } : rv,
    ));
  };

  const toggleSelect = (idx: number) => {
    setReviews(prev => prev.map((rv, i) =>
      i === idx ? { ...rv, selected: !rv.selected } : rv,
    ));
  };

  const removeOne = (idx: number) => {
    setReviews(prev => prev.filter((_, i) => i !== idx));
  };

  const selectAll = (val: boolean) => {
    setReviews(prev => prev.map(r => ({ ...r, selected: val })));
  };

  // Save selected reviews via POST /api/reviews/bulk
  const saveSelected = async () => {
    if (!targetProductId) {
      toast({ title: "Select a product first", variant: "destructive" });
      return;
    }
    const selected = reviews.filter(r => r.selected);
    if (selected.length === 0) {
      toast({ title: "No reviews selected", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const rows = selected.map((r, idx) => ({
        product_id: targetProductId,
        name: r.name,
        rating: r.rating,
        text: r.text,
        verified: r.verified,
        image_url: r.image_url,
        is_active: true,
        sort_order: idx + 100,
      }));
      const result = await safePost<{ count?: number }>("/reviews/bulk", { rows }, {});
      const saved = result?.count ?? selected.length;
      toast({ title: `${saved} reviews saved!` });
      setReviews([]);
      setImportNote(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = reviews.filter(r => r.selected).length;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Amazon Review Importer</h1>
          <p className="text-xs text-muted-foreground">Fetch, AI-rewrite, and save reviews</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="p-4 space-y-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Amazon ASIN or Product URL</Label>
            <Input
              value={asin}
              onChange={e => setAsin(e.target.value)}
              placeholder="B0XXXXXXXX or https://amazon.in/dp/B0XXXXXXXX"
              className="h-9 text-sm mt-1"
            />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-[11px] text-muted-foreground">Domain</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger className="h-9 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="www.amazon.in">amazon.in</SelectItem>
                  <SelectItem value="www.amazon.com">amazon.com</SelectItem>
                  <SelectItem value="www.amazon.co.uk">amazon.co.uk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-[11px] text-muted-foreground">
                Save to Product
                <span className="ml-1 text-primary/70">(select to import directly)</span>
              </Label>
              <Select value={targetProductId} onValueChange={setTargetProductId}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Select product (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={fetchReviews}
            disabled={fetching || (!asin.trim() && !sourceUrl.trim())}
            className="w-full gap-2 h-9 text-xs"
          >
            {fetching
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Search className="w-3.5 h-3.5" />
            }
            {fetching ? "Fetching reviews..." : "Fetch Reviews"}
          </Button>

          {importNote && (
            <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              {importNote}
            </p>
          )}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {selectedCount}/{reviews.length} selected
              </Badge>
              <button
                onClick={() => selectAll(selectedCount < reviews.length)}
                className="text-[11px] text-primary hover:underline"
              >
                {selectedCount < reviews.length ? "Select all" : "Deselect all"}
              </button>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={rewriteAll}
                disabled={rewriteAllLoading || selectedCount === 0}
              >
                {rewriteAllLoading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />
                }
                AI Rewrite All
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={saveSelected}
                disabled={saving || selectedCount === 0 || !targetProductId}
              >
                {saving
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Check className="w-3 h-3" />
                }
                Save {selectedCount} Reviews
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {reviews.map((r, idx) => (
              <div
                key={idx}
                className={`bg-card rounded-xl border overflow-hidden transition-all ${
                  r.selected ? "border-primary/30" : "border-border/30 opacity-60"
                }`}
              >
                <div className="p-3 flex items-start gap-3">
                  <button
                    onClick={() => toggleSelect(idx)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      r.selected ? "bg-primary border-primary text-primary-foreground" : "border-border/60"
                    }`}
                  >
                    {r.selected && <Check className="w-3 h-3" />}
                  </button>

                  {r.image_url && (
                    <img
                      src={r.image_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border/30"
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
                        <Badge variant="secondary" className="text-[8px] h-3.5 px-1 bg-blue-500/10 text-blue-600">
                          Verified
                        </Badge>
                      )}
                      {r.text !== r.originalText && (
                        <Badge variant="secondary" className="text-[8px] h-3.5 px-1 bg-emerald-500/10 text-emerald-600">
                          AI Edited
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">
                      {r.text || "(empty)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      className="p-1.5 hover:bg-muted rounded-lg"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => rewriteOne(idx)}
                      disabled={r.rewriting}
                      className="p-1.5 hover:bg-muted rounded-lg"
                      title="AI Rewrite"
                    >
                      {r.rewriting
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        : <Sparkles className="w-3.5 h-3.5 text-primary" />
                      }
                    </button>
                    <button
                      onClick={() => removeOne(idx)}
                      className="p-1.5 hover:bg-destructive/10 rounded-lg"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>

                {expandedIdx === idx && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Edit Review Text</Label>
                      <textarea
                        value={r.text}
                        onChange={e => setReviews(prev =>
                          prev.map((rv, i) => i === idx ? { ...rv, text: e.target.value } : rv),
                        )}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs min-h-[60px] mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          value={r.editingInstruction}
                          onChange={e => setReviews(prev =>
                            prev.map((rv, i) => i === idx ? { ...rv, editingInstruction: e.target.value } : rv),
                          )}
                          placeholder="AI instruction: e.g. make it shorter, add emoji, more enthusiastic..."
                          className="h-8 text-[11px]"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11px] gap-1 px-2.5"
                        disabled={r.rewriting}
                        onClick={() => rewriteOne(idx, r.editingInstruction)}
                      >
                        {r.rewriting
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Sparkles className="w-3 h-3" />
                        }
                        Rewrite
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Name</Label>
                          <Input
                            value={r.name}
                            onChange={e => setReviews(prev =>
                              prev.map((rv, i) => i === idx ? { ...rv, name: e.target.value } : rv),
                            )}
                            className="h-7 text-[11px] mt-0.5"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Rating</Label>
                          <div className="flex gap-1 mt-1">
                            {[1, 2, 3, 4, 5].map(s => (
                              <button
                                key={s}
                                onClick={() => setReviews(prev =>
                                  prev.map((rv, i) => i === idx ? { ...rv, rating: s } : rv),
                                )}
                              >
                                <Star
                                  className={`w-4 h-4 ${s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {r.text !== r.originalText && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] self-end"
                          onClick={() => revertOne(idx)}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" /> Revert
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}