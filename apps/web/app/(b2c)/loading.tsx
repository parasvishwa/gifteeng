// Skeleton shown while any /b2c/* route segment streams from the server.
// Next.js renders this immediately so the user sees brand colours +
// approximate layout instead of a blank page during the round-trip.
//
// Reusable across home, products list, collections, etc — those that
// don't ship their own loading.tsx fall through to this one.

export default function B2cLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero hint */}
      <div className="container relative mx-auto px-4 pt-8 pb-4 text-center">
        <div className="mx-auto h-4 w-40 rounded-full bg-muted/60 animate-pulse mb-5" />
        <div className="mx-auto h-12 w-3/4 max-w-xl rounded-lg bg-muted/60 animate-pulse mb-3" />
        <div className="mx-auto h-12 w-2/3 max-w-md rounded-lg bg-muted/60 animate-pulse mb-7" />
        {/* Search bar */}
        <div className="mx-auto h-12 w-full max-w-xl rounded-2xl bg-muted/40 animate-pulse mb-3" />
        {/* Chip strip */}
        <div className="flex justify-center gap-3 overflow-hidden mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 w-[68px] shrink-0">
              <div className="size-11 rounded-full bg-muted/50 animate-pulse" />
              <div className="h-2.5 w-12 rounded bg-muted/50 animate-pulse" />
            </div>
          ))}
        </div>
        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-10 w-32 rounded-xl bg-muted/60 animate-pulse" />
          <div className="h-10 w-24 rounded-xl bg-muted/40 animate-pulse" />
        </div>
      </div>

      {/* Product grid skeleton */}
      <div className="container max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
