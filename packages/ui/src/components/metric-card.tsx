import * as React from "react";
import { cn } from "../lib/cn";
import { Card, CardContent, CardHeader } from "./ui/card";

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon,
  trend,
  className,
}: MetricCardProps) {
  const trendColor =
    trend?.direction === "up"
      ? "text-emerald-600"
      : trend?.direction === "down"
        ? "text-red-600"
        : "text-muted-foreground";
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {icon ? (
          <div className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend ? (
          <p className={cn("mt-1 text-xs", trendColor)}>{trend.value}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
