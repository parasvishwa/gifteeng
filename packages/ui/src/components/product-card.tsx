import * as React from "react";
import { cn } from "../lib/cn";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export type ProductCardProps = {
  title: string;
  priceLabel: string;
  salePriceLabel?: string;
  imageUrl?: string;
  href?: string;
  className?: string;
  badge?: string;
  onAddToCart?: () => void;
};

export function ProductCard({
  title,
  priceLabel,
  salePriceLabel,
  imageUrl,
  href,
  className,
  badge,
  onAddToCart,
}: ProductCardProps) {
  const media = (
    <div className="relative aspect-square w-full overflow-hidden bg-muted">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : null}
      {badge ? (
        <Badge className="absolute left-2 top-2" variant="secondary">
          {badge}
        </Badge>
      ) : null}
    </div>
  );

  const body = (
    <>
      <CardContent className="p-4">
        <div className="line-clamp-2 text-sm font-medium">{title}</div>
        <div className="mt-2 flex items-baseline gap-2">
          {salePriceLabel ? (
            <>
              <span className="text-base font-bold text-foreground">
                {salePriceLabel}
              </span>
              <span className="text-xs text-muted-foreground line-through">
                {priceLabel}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-foreground">
              {priceLabel}
            </span>
          )}
        </div>
      </CardContent>
      {onAddToCart ? (
        <CardFooter className="p-4 pt-0">
          <Button
            className="w-full"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onAddToCart();
            }}
          >
            Add to cart
          </Button>
        </CardFooter>
      ) : null}
    </>
  );

  const card = (
    <Card
      className={cn(
        "group overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
        className,
      )}
    >
      {media}
      {body}
    </Card>
  );

  return href ? (
    <a href={href} className="block">
      {card}
    </a>
  ) : (
    card
  );
}
