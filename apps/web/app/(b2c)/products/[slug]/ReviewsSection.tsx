"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@gifteeng/ui";
import {
  Star,
  CheckCircle2,
  Video,
  Image as ImageIcon,
  Upload,
  X,
  Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Review {
  id: string;
  rating: number;
  title?: string | null;
  text?: string;
  body?: string;
  reviewer_name?: string;
  authorName?: string;
  reviewer?: { name?: string; avatarUrl?: string | null; isOwn?: boolean };
  pending?: boolean;
  created_at?: string;
  createdAt?: string;
  verified?: boolean;
  // Source — "gifteeng" for native, "amazon"/"flipkart"/etc. for imports.
  source?: string;
  // Full photo array (the card shows them all in a strip, not just one).
  photoUrls?: string[];
  video_url?: string;
  // Legacy single-photo fallback for older API shapes.
  image_url?: string;
}

interface ReviewsSectionProps {
  productId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function formatDate(raw?: string): string {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

function maskedName(raw?: string): string {
  if (!raw) return "Verified buyer";
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Star display ─────────────────────────────────────────────────────────────

function StarRating({
  value,
  size = "sm",
}: {
  value: number;
  size?: "sm" | "lg";
}) {
  const px = size === "lg" ? 22 : 14;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={px}
          className={
            i <= value
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted-foreground/30"
          }
        />
      ))}
    </span>
  );
}

// ─── Interactive star picker ──────────────────────────────────────────────────

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        >
          <Star
            size={26}
            className={
              i <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground/30"
            }
          />
        </button>
      ))}
    </span>
  );
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

// ─── Rating breakdown bars ───────────────────────────────────────────────────

function RatingBreakdown({ reviews }: { reviews: Review[] }) {
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));
  const total = reviews.length;
  return (
    <div className="space-y-1.5 w-full max-w-xs">
      {counts.map(({ star, count }) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-6 text-right text-muted-foreground">{star}★</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-muted-foreground">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Write-a-review modal ─────────────────────────────────────────────────────

function WriteReviewModal({
  productId,
  open,
  onClose,
}: {
  productId: string;
  open: boolean;
  onClose: () => void;
}) {
  // Default to 5 stars filled — customer can lower if their experience was different.
  const [rating, setRating] = useState(5);
  const [title, setTitle]   = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Media attachments — customer can add up to 5 photos + 1 short video.
  const [photos, setPhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const [video, setVideo] = useState<{ file: File; preview: string } | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const MAX_PHOTOS = 5;
  const MAX_PHOTO_MB = 10;
  const MAX_VIDEO_MB = 30;

  // Reset state when modal reopens
  useEffect(() => {
    if (open) {
      setRating(0);
      setText("");
      setTitle("");
      setDone(false);
      setError("");
      // Revoke any existing object URLs before resetting
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      if (video) URL.revokeObjectURL(video.preview);
      setPhotos([]);
      setVideo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = files.slice(0, room);
    const rejected: string[] = [];
    const accepted: Array<{ file: File; preview: string }> = [];
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        rejected.push(`${f.name} (not an image)`);
        continue;
      }
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
        rejected.push(`${f.name} (over ${MAX_PHOTO_MB}MB)`);
        continue;
      }
      accepted.push({ file: f, preview: URL.createObjectURL(f) });
    }
    if (accepted.length > 0) setPhotos((prev) => [...prev, ...accepted]);
    if (rejected.length > 0) {
      setError(`Some files were skipped: ${rejected.join(", ")}`);
    }
    e.target.value = "";
  };

  const handlePickVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please pick a video file.");
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`Video must be under ${MAX_VIDEO_MB}MB.`);
      return;
    }
    if (video) URL.revokeObjectURL(video.preview);
    setVideo({ file, preview: URL.createObjectURL(file) });
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const removeVideo = () => {
    if (video) URL.revokeObjectURL(video.preview);
    setVideo(null);
  };

  const uploadOne = async (file: File, token: string): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Upload failed (${res.status})`);
    }
    const data = await res.json();
    const url: string | undefined = data.url ?? data.signedUrl ?? data.path;
    if (!url) throw new Error("Upload response missing URL");
    // If the server returned a relative path, prefix the API base so the
    // backend can resolve the URL too.
    if (url.startsWith("/")) return `${API_BASE}${url}`;
    return url;
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Please select a star rating.");
      return;
    }
    if (text.trim().length < 20) {
      setError("Review must be at least 20 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const token = localStorage.getItem("gifteeng.b2c.token") ?? "";
      const payload = decodeJwtPayload(token);
      const customerId =
        (payload?.sub as string) ??
        (payload?.id as string) ??
        (payload?.customerId as string) ??
        "";

      // 1) Upload any attached photos + video first
      let photoUrls: string[] = [];
      let videoUrl: string | undefined;
      if (photos.length > 0 || video) {
        setUploadingMedia(true);
        try {
          photoUrls = await Promise.all(photos.map((p) => uploadOne(p.file, token)));
          if (video) videoUrl = await uploadOne(video.file, token);
        } finally {
          setUploadingMedia(false);
        }
      }

      // 2) Submit the review with media URLs
      const res = await fetch(`${API_BASE}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId,
          rating,
          ...(title.trim() ? { title: title.trim() } : {}),
          text: text.trim(),
          body: text.trim(),
          customerId,
          ...(photoUrls.length > 0 ? { photoUrls } : {}),
          ...(videoUrl ? { videoUrl } : {}),
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Server error ${res.status}`);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Write a Review</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 size={40} className="text-green-500" />
            <p className="text-base font-medium">
              Thank you! Your review is pending approval.
            </p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            <div>
              <p className="mb-2 text-sm font-medium">How would you rate it?</p>
              <StarPicker value={rating} onChange={setRating} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Title <span className="text-xs text-muted-foreground font-normal">(optional)</span></p>
              <input
                type="text"
                placeholder="Summarise your experience"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground text-right">
                {title.length} / 60
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Your review *</p>
              <Textarea
                rows={5}
                placeholder="Tell others what you liked or didn't…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="resize-none"
                maxLength={500}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {text.trim().length} / 20 minimum characters · {text.length} / 500 max
              </p>
            </div>

            {/* ── Photo attachments (max 5) ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <ImageIcon size={14} /> Add photos
                </p>
                <span className="text-xs text-muted-foreground">
                  {photos.length}/{MAX_PHOTOS} · up to {MAX_PHOTO_MB}MB each
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div
                    key={i}
                    className="relative h-16 w-16 overflow-hidden rounded border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.preview}
                      alt={`Attachment ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                      aria-label="Remove photo"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Upload size={14} />
                    <span className="text-[10px] font-medium">Photo</span>
                  </button>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePickPhotos}
              />
            </div>

            {/* ── Video attachment (max 1) ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Video size={14} /> Add a video
                </p>
                <span className="text-xs text-muted-foreground">
                  optional · up to {MAX_VIDEO_MB}MB
                </span>
              </div>
              {video ? (
                <div className="relative overflow-hidden rounded border bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={video.preview}
                    className="max-h-48 w-full object-contain"
                    controls
                  />
                  <button
                    type="button"
                    onClick={removeVideo}
                    className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                    aria-label="Remove video"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Upload size={14} />
                  Upload video
                </button>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handlePickVideo}
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting || uploadingMedia ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" />
                    {uploadingMedia ? "Uploading media…" : "Submitting…"}
                  </span>
                ) : (
                  "Submit Review"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

// ─── Brand mark — inline SVGs so they always render ────────────────────────
// External CDNs (simpleicons.org) sometimes get blocked by adblockers and
// render as 📦 placeholder icons. Inline SVGs render every time. Colours
// match each brand's primary identity.
function BrandMark({ source, size = 14 }: { source: string; size?: number }) {
  switch (source.toLowerCase()) {
    case "amazon":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Amazon" role="img">
          <path fill="#FF9900" d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726-1.53.41-3.045.615-4.516.615-2.265 0-4.41-.396-6.435-1.187-2.04-.79-3.87-1.91-5.5-3.358-.094-.08-.137-.157-.137-.23 0-.048.018-.092.05-.13zm6.232-7.882c0-1.078.265-2.005.795-2.78.53-.776 1.265-1.36 2.176-1.755.83-.36 1.85-.622 3.072-.78.413-.05 1.092-.108 2.038-.18v-.39c0-.984-.108-1.646-.32-1.984-.32-.46-.83-.69-1.52-.69h-.18c-.5.058-.94.224-1.31.5-.36.275-.6.654-.71 1.135-.07.302-.218.475-.444.52L7.768 4.5c-.22-.05-.33-.165-.33-.345 0-.036.005-.073.014-.115.225-1.155.78-2.012 1.665-2.57.86-.55 1.86-.85 3-.94h.475c1.485 0 2.642.385 3.473 1.155.135.13.255.26.36.4.105.135.19.265.255.4.06.13.115.295.155.49.045.195.075.325.09.4.015.07.03.245.04.535.015.29.022.45.022.495v4.69c0 .335.05.64.143.92.094.275.187.475.275.6.087.12.235.32.443.585.078.114.118.2.118.27 0 .075-.04.143-.118.2-.785.692-1.215 1.07-1.27 1.13-.18.16-.397.182-.66.07-.12-.105-.225-.205-.318-.305-.09-.1-.16-.18-.21-.245-.04-.06-.105-.155-.198-.275-.085-.12-.145-.205-.18-.246-.5.553-.99.892-1.482 1.05-.305.094-.685.14-1.13.14-.685 0-1.255-.21-1.7-.628-.45-.42-.674-1.02-.674-1.79zm2.974-.34c0 .43.108.78.32 1.03.21.255.502.38.86.38.03 0 .075-.005.135-.014l.116-.014c.456-.124.806-.42 1.05-.886.115-.21.197-.43.247-.65.05-.226.075-.41.08-.55.005-.135.01-.36.01-.67v-.36c-.9 0-1.58.062-2.038.19-1.34.376-2.013 1.218-2.013 2.524zm10.83 8.13c.123-.156.31-.27.564-.34.41-.12.835-.183 1.27-.193.115-.005.225 0 .33.014.66.06 1.057.17 1.193.328.06.085.09.21.09.382v.15c0 .504-.137 1.097-.412 1.78-.276.685-.66 1.234-1.156 1.654-.075.06-.143.094-.21.094-.03 0-.06-.005-.09-.014-.105-.05-.13-.143-.075-.275.674-1.585.99-2.685.93-3.297-.014-.196-.077-.34-.187-.43-.106-.092-.227-.155-.36-.19-.46-.07-1.014-.052-1.665.05-.286.04-.55.078-.79.13-.06 0-.11-.013-.137-.04-.027-.027-.034-.052-.02-.078.005-.014.013-.027.024-.04zm-2.58-1.5c.04-.06.103-.107.18-.137 1.34-.61 2.475-.916 3.404-.916.255 0 .504.022.747.067.79.165 1.305.43 1.55.797.245.366.367.83.367 1.39 0 .82-.215 1.65-.643 2.49-.43.84-1.03 1.514-1.806 2.024-.114.072-.21.106-.286.106-.038 0-.075-.014-.116-.04-.116-.06-.143-.165-.087-.328.69-1.62 1.045-2.764 1.045-3.43 0-.21-.04-.366-.123-.464-.21-.245-.794-.366-1.755-.366-.36 0-.78.04-1.275.117-.5.077-.95.155-1.36.232-.114.03-.184.044-.21.044-.078 0-.12-.024-.132-.07-.014-.03-.014-.07.005-.116z"/>
        </svg>
      );
    case "flipkart":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Flipkart" role="img">
          <rect width="24" height="24" rx="4" fill="#2874F0"/>
          <path fill="#FFC200" d="M7 7h10v3H7z"/>
          <path fill="#fff" d="M9 11h6v6h-2v-2h-2v2H9z"/>
        </svg>
      );
    case "myntra":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Myntra" role="img">
          <rect width="24" height="24" rx="4" fill="#fff"/>
          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#FF3F6C">M</text>
        </svg>
      );
    case "meesho":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Meesho" role="img">
          <rect width="24" height="24" rx="4" fill="#F43397"/>
          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">m</text>
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Google" role="img">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      );
    case "gifteeng":
      // Gifteeng official mark — inline SVG copy of /icons/gifteeng-mark.svg
      // so it renders even when CDN/static asset loading is slow.
      return (
        <svg viewBox="0 0 44.86 44.86" width={size} height={size} aria-label="Gifteeng" role="img">
          <circle cx="22.43" cy="22.43" r="22.43" fill="#fff"/>
          <path fill="#EF3752" d="M37.28,11.78c-.36-1.11-1.42-1.88-2.59-1.89-.75,0-1.39.27-1.94.78-.34.32-.6.7-.81,1.12-.04-.02-.04-.06-.05-.08-.55-1.26-1.7-1.93-3.06-1.77-1.32.16-2.38,1.36-2.39,2.73,0,.55.16,1.06.41,1.55.09.18.2.36.31.52-1.61-1.7-4.24-2.71-7.93-2.71-5.46,0-9.35,2.38-9.35,8s3.89,8,9.35,8c3.76,0,6.43-1.05,8.05-2.84-.19,4.08-1.97,5.92-6.76,5.92-1.85,0-3.72-.22-5.35-.48-1.89-.3-3.59,1.16-3.59,3.07h0c1.54.41,5.35,1.27,9.97,1.27,6.03,0,10.38-2.81,10.38-9.3v-5.04c0-.95.45-1.84,1.21-2.42l.02-.02.06-.04h0c.88-.67,1.72-1.39,2.49-2.19.49-.52.95-1.07,1.29-1.71.39-.76.58-1.57.29-2.48ZM20.9,24.16c-4.35,0-6.4-1.22-6.4-4.13s2.05-4.13,6.4-4.13,6.38,1.22,6.38,4.13-2.03,4.13-6.38,4.13Z"/>
        </svg>
      );
    default:
      return (
        <span className="inline-flex items-center justify-center" style={{ width: size, height: size }} aria-label="Gifteeng">
          <span style={{ fontSize: size - 2 }}>🎁</span>
        </span>
      );
  }
}

// Hashes a string into a stable HSL hue — used for avatar background colour
// so each reviewer gets a consistent unique colour across page loads.
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ReviewCard({ review }: { review: Review }) {
  const name = review.reviewer?.name
    ?? maskedName(review.reviewer_name ?? review.authorName);
  const date = formatDate(review.created_at ?? review.createdAt);
  const reviewText = review.text ?? review.body ?? "";
  const photos: string[] = Array.isArray(review.photoUrls) && review.photoUrls.length > 0
    ? review.photoUrls
    : (review.image_url ? [review.image_url] : []);
  const sourceKey = (review.source ?? "gifteeng").toLowerCase();
  const hue       = hueFor(name);

  // Lightbox — clicking any photo opens fullscreen with arrow navigation
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const heroPhoto = photos[0];

  return (
    <li className="p-5 sm:p-6">
      {/* ── Header row: avatar + name + brand logo + date ──────────────── */}
      <div className="flex items-start gap-3">
        {review.reviewer?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.reviewer.avatarUrl}
            alt={name}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: `hsl(${hue} 65% 50%)` }}
            aria-label={`${name} avatar`}
          >
            {initialsFor(name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-[14px] leading-tight">{name}</span>
            <BrandMark source={sourceKey} size={14} />
            {review.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={10} />
                Verified
              </span>
            )}
            {date ? (
              <span className="ml-auto text-[11px] text-muted-foreground">{date}</span>
            ) : null}
          </div>
          <div className="mt-1">
            <StarRating value={review.rating} />
          </div>
        </div>
      </div>

      {/* ── Title + body ───────────────────────────────────────────────── */}
      {review.title ? (
        <h4 className="mt-3 text-[14px] font-semibold leading-snug">{review.title}</h4>
      ) : null}
      {reviewText ? (
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/85">
          {reviewText}
        </p>
      ) : null}

      {/* ── Photo strip — horizontal, ALL photos, click to zoom ────────── */}
      {photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIdx(i)}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted transition-transform hover:scale-105 sm:h-24 sm:w-24"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Review photo ${i + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Lightbox — click photo for fullscreen ──────────────────────── */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <Lightbox
          photos={photos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChange={(i) => setLightboxIdx(i)}
        />
      )}
    </li>
  );
}

// ─── Fullscreen photo lightbox with prev/next arrows ────────────────────────
function Lightbox({
  photos, index, onClose, onChange,
}: {
  photos: string[];
  index:  number;
  onClose: () => void;
  onChange: (i: number) => void;
}) {
  // Esc + arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onChange(index - 1);
      else if (e.key === "ArrowRight" && index < photos.length - 1) onChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onChange]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[index]}
        alt={`Photo ${index + 1} of ${photos.length}`}
        className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-black hover:bg-white"
      >
        <X size={18} />
      </button>
      {photos.length > 1 && (
        <>
          {index > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => { e.stopPropagation(); onChange(index - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-black hover:bg-white"
            >‹</button>
          )}
          {index < photos.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); onChange(index + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-black hover:bg-white"
            >›</button>
          )}
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur">
            {index + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReviewsSection({ productId }: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Check auth + fetch reviews on mount
  useEffect(() => {
    const token = localStorage.getItem("gifteeng.b2c.token");
    if (token) setLoggedIn(true);

    const fetchReviews = async () => {
      try {
        // Use the AGGREGATED endpoint — combines native Gifteeng reviews with
        // external imports (Amazon/Flipkart/Myntra/Google) tagged to this
        // product. RELATIVE URL on purpose: Next.js's `/api/*` rewrite
        // proxies same-origin requests to the API, so this works in dev,
        // staging and prod without depending on NEXT_PUBLIC_API_BASE_URL
        // being set (which it isn't in the prod build).
        const res = await fetch(
          `/api/reviews/aggregated?productId=${encodeURIComponent(productId)}&pageSize=50`,
        );
        if (!res.ok) {
          setReviews([]);
          return;
        }
        const data = await res.json() as {
          items?: Array<{
            id: string;
            rating: number;
            title?: string | null;
            body?: string;
            author?: string | null;
            authorAvatar?: string | null;
            reviewDate?: string | null;
            photoUrls?: string[];
            videoUrl?: string | null;
            isNative?: boolean;
            createdAt?: string;
          }>;
        };
        const items = Array.isArray(data?.items) ? data.items as Array<{
          id: string; source?: string; rating: number;
          title?: string | null; body?: string;
          author?: string | null; authorAvatar?: string | null;
          reviewDate?: string | null; createdAt?: string;
          photoUrls?: string[]; videoUrl?: string | null; isNative?: boolean;
        }> : [];
        const mapped: Review[] = items.map((r) => ({
          id:           r.id,
          source:       r.source ?? (r.isNative ? "gifteeng" : "amazon"),
          rating:       r.rating,
          title:        r.title ?? null,
          text:         r.body ?? "",
          body:         r.body ?? "",
          authorName:   r.author ?? undefined,
          reviewer:     { name: r.author ?? undefined, avatarUrl: r.authorAvatar ?? null },
          createdAt:    r.reviewDate ?? r.createdAt ?? "",
          verified:     !!r.isNative,
          photoUrls:    Array.isArray(r.photoUrls) ? r.photoUrls : [],
          image_url:    Array.isArray(r.photoUrls) && r.photoUrls.length > 0 ? r.photoUrls[0] : undefined,
          video_url:    r.videoUrl ?? undefined,
        }));
        setReviews(mapped);
      } catch {
        setReviews([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchReviews();
  }, [productId]);

  // Average rating
  const average =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <section id="reviews" className="mt-16">
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Star size={22} className="fill-amber-400 text-amber-400" />
          <h2 className="text-2xl font-semibold">Customer Reviews</h2>
        </div>
        {loggedIn ? (
          <Button onClick={() => setModalOpen(true)} size="sm">
            Write a Review
          </Button>
        ) : null}
      </div>

      {/* Summary bar */}
      {!loading && reviews.length > 0 ? (
        <div className="mb-8 flex flex-wrap items-start gap-8">
          {/* Average score */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-5xl font-bold leading-none">
              {average.toFixed(1)}
            </span>
            <StarRating value={Math.round(average)} size="lg" />
            <span className="text-sm text-muted-foreground">
              {reviews.length} review{reviews.length !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Breakdown bars */}
          <RatingBreakdown reviews={reviews} />
        </div>
      ) : null}

      {/* Content */}
      {loading ? (
        <ul className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ul>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Star size={36} className="text-muted-foreground/40" />
          <p className="text-base text-muted-foreground">
            No reviews yet — be the first!
          </p>
          {loggedIn ? (
            <Button onClick={() => setModalOpen(true)} size="sm" variant="outline">
              Write a Review
            </Button>
          ) : null}
        </div>
      ) : (
        // Detail-list layout — single column, generous space, photos as a
        // horizontal strip. Modelled after Amazon/Trustpilot review pages.
        <ul className="divide-y divide-border rounded-xl border bg-card">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </ul>
      )}

      <WriteReviewModal
        productId={productId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
