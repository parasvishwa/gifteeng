"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gift, ArrowRight, ArrowLeft, Sparkles, Heart, Users, Briefcase,
  Baby, HeartHandshake, Star, Cake, Gem, Church, Flame, Bookmark,
} from "lucide-react";
import ProductCard from "../_components/sections/ProductCard";

interface QuizProduct {
  id: string;
  name: string;
  price: number;
  original_price?: number;
  image?: string;
  images?: string[];
  description?: string;
  rating?: number;
  reviews?: number;
  customizable?: boolean;
  category?: string;
  tags?: string[] | null;
}

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const res = await fetch(`${base}/api${path}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

const recipientOptions = [
  { value: "partner", label: "Partner", icon: Heart },
  { value: "parent", label: "Parent", icon: HeartHandshake },
  { value: "friend", label: "Friend", icon: Users },
  { value: "colleague", label: "Colleague", icon: Briefcase },
  { value: "child", label: "Child", icon: Baby },
  { value: "anyone", label: "Someone Special", icon: Star },
];

const occasionOptions = [
  { value: "birthday", label: "Birthday", icon: Cake },
  { value: "anniversary", label: "Anniversary", icon: Gem },
  { value: "wedding", label: "Wedding", icon: Church },
  { value: "diwali", label: "Diwali", icon: Flame },
  { value: "other", label: "Other", icon: Bookmark },
];

const STEPS = ["Who's the gift for?", "What's the occasion?", "Budget range?"];

export default function GiftQuizPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");
  const [budget, setBudget] = useState(1500);
  const [products, setProducts] = useState<QuizProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const canProceed =
    (step === 0 && recipient !== "") ||
    (step === 1 && occasion !== "") ||
    (step === 2 && budget > 0);

  const fetchResults = async () => {
    setLoading(true);
    const categoryParam = occasion && occasion !== "other"
      ? `&category=${encodeURIComponent(occasion)}`
      : "";
    const searchParam = recipient ? `&search=${encodeURIComponent(recipient)}` : "";
    const data = await safeGet<{ items: QuizProduct[] }>(
      `/products?pageSize=12${categoryParam}${searchParam}`,
      { items: [] }
    );
    let results = (data.items || []) as QuizProduct[];
    // Price filter by budget
    results = results.filter((p) => p.price <= budget + 200);
    setProducts(results.slice(0, 6));
    setLoading(false);
  };

  const handleNext = () => {
    if (step < 2) setStep(step + 1);
    else {
      setShowResults(true);
      fetchResults();
    }
  };

  const handleBack = () => {
    if (showResults) { setShowResults(false); return; }
    if (step > 0) setStep(step - 1);
  };

  const progressPct = showResults ? 100 : ((step + 1) / 3) * 100;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <div className="pt-24 md:pt-28 max-w-2xl mx-auto px-4 md:px-8 py-12">
        {/* Progress */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
              {showResults ? "Your Recommendations" : `Step ${step + 1} of 3`}
            </span>
            <span className="text-[10px] font-semibold text-primary">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
            <div className="h-full bg-[#EF3752] rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {!showResults ? (
          <div className="animate-fade-in">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                <Gift className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mb-2">{STEPS[step]}</h1>
              <p className="text-sm text-muted-foreground/60">
                {step === 0 && "Tell us who you're shopping for"}
                {step === 1 && "What's the special occasion?"}
                {step === 2 && "Slide to set your budget"}
              </p>
            </div>

            {/* Options */}
            {step === 0 && (
              <div className="grid grid-cols-2 gap-3 mb-10">
                {recipientOptions.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button key={opt.value} onClick={() => setRecipient(opt.value)}
                      className={`flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 ${
                        recipient === opt.value
                          ? "border-transparent bg-[#EF3752]/10 scale-[1.02]"
                          : "border-border bg-card hover:bg-muted"
                      }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${recipient === opt.value ? "bg-[#EF3752]/15" : "bg-muted"}`}>
                        <Icon className={`w-5 h-5 ${recipient === opt.value ? "text-[#EF3752]" : "text-muted-foreground"}`} />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
                {occasionOptions.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button key={opt.value} onClick={() => setOccasion(opt.value)}
                      className={`flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 ${
                        occasion === opt.value
                          ? "border-transparent bg-[#EF3752]/10 scale-[1.02]"
                          : "border-border bg-card hover:bg-muted"
                      }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${occasion === opt.value ? "bg-[#EF3752]/15" : "bg-muted"}`}>
                        <Icon className={`w-5 h-5 ${occasion === opt.value ? "text-[#EF3752]" : "text-muted-foreground"}`} />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 2 && (
              <div className="mb-10 p-8 rounded-2xl bg-card">
                <div className="text-center mb-4">
                  <span className="font-display text-4xl font-black text-foreground">₹{budget}</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={5000}
                  step={100}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-2">
                  <span>₹100</span>
                  <span>₹5,000</span>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button onClick={handleBack}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-muted border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              )}
              <button onClick={handleNext} disabled={!canProceed}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                  canProceed
                    ? "bg-[#EF3752] text-white shadow-sm hover:opacity-90 active:scale-[0.98]"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}>
                {step === 2 ? (
                  <><Sparkles className="w-4 h-4" /> Show My Recommendations</>
                ) : (
                  <>Next <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Results */
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Gift className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-display font-extrabold tracking-tight mb-1">
                Perfect Picks For You
              </h2>
              <p className="text-xs text-muted-foreground/60">
                Based on your preferences — {occasionOptions.find(o => o.value === occasion)?.label} gift
                {recipient && ` for ${recipientOptions.find(r => r.value === recipient)?.label}`}
              </p>
            </div>

            <button onClick={handleBack}
              className="flex items-center gap-2 text-xs font-semibold text-primary mb-6 hover:underline">
              <ArrowLeft className="w-3.5 h-3.5" /> Retake Quiz
            </button>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rounded-2xl bg-card border border-border/20 overflow-hidden animate-pulse">
                    <div className="aspect-square bg-muted" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 w-4/5 bg-muted rounded" />
                      <div className="h-4 w-1/3 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground text-sm">No products matched your criteria.</p>
                <button onClick={() => { setShowResults(false); setStep(0); }}
                  className="mt-3 text-primary text-sm font-semibold hover:underline">Try different answers</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {products.map(p => (
                  <ProductCard
                    key={p.id}
                    productId={p.id}
                    name={p.name}
                    image={p.image ?? p.images?.[0] ?? ""}
                    price={p.price}
                    originalPrice={p.original_price}
                    customizable={p.customizable}
                    description={p.description}
                    rating={p.rating}
                    reviews={p.reviews}
                  />
                ))}
              </div>
            )}

            <div className="mt-10 text-center">
              <button onClick={() => router.push("/products")}
                className="text-sm font-semibold text-primary hover:underline">
                Browse All Products →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
