import { Skeleton } from "@gifteeng/ui";

const ProductCardSkeleton = () => (
  <div className="rounded-xl overflow-hidden bg-card border border-border/30">
    <Skeleton className="aspect-square w-full" />
    <div className="p-2.5 space-y-2">
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3.5 w-1/3" />
      <Skeleton className="h-7 w-full rounded-xl" />
    </div>
  </div>
);

const CategorySkeleton = () => (
  <Skeleton className="aspect-square rounded-xl" />
);

const HomeSkeleton = () => (
  <div className="min-h-screen bg-background animate-in fade-in duration-300">
    {/* Navbar skeleton */}
    <div className="sticky top-0 z-50 bg-background border-b border-border/30 px-4 py-3 flex items-center justify-between">
      <Skeleton className="h-8 w-24 rounded-lg" />
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>

    {/* Hero skeleton */}
    <div className="px-4 pt-4 pb-2">
      <Skeleton className="w-full h-[180px] rounded-lg" />
    </div>

    {/* Trust bar skeleton */}
    <div className="px-4 py-3 flex gap-3 overflow-hidden">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-8 min-w-[120px] rounded-full flex-shrink-0" />
      ))}
    </div>

    {/* Category grid skeleton */}
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-1 h-6 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[...Array(4)].map((_, i) => (
          <CategorySkeleton key={i} />
        ))}
      </div>
    </div>

    {/* Product section skeleton */}
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-1 h-6 rounded-full" />
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[...Array(4)].map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>

    {/* Another product section skeleton */}
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-1 h-6 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="min-w-[150px] w-[150px] flex-shrink-0">
            <ProductCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default HomeSkeleton;
