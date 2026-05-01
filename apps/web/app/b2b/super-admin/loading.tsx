// Generic admin-page skeleton while data hydrates. Each individual
// page can ship a more specific one if it wants.
export default function AdminLoading() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-7 w-56 rounded bg-muted/60 animate-pulse" />
      <div className="h-3 w-72 rounded bg-muted/40 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="h-8" />
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-b-0">
            <div className="size-10 rounded-full bg-muted/50 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/3 rounded bg-muted/50 animate-pulse" />
              <div className="h-3 w-1/4 rounded bg-muted/40 animate-pulse" />
            </div>
            <div className="h-7 w-20 rounded-md bg-muted/40 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
