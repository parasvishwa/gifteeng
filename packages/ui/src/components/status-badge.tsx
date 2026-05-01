import * as React from "react";
import { Badge, type BadgeProps } from "./ui/badge";

const STATUS_MAP: Record<string, BadgeProps["variant"]> = {
  // Order statuses
  pending: "secondary",
  processing: "secondary",
  confirmed: "default",
  shipped: "default",
  delivered: "default",
  completed: "default",
  cancelled: "destructive",
  canceled: "destructive",
  refunded: "outline",
  returned: "outline",
  // Payment statuses
  paid: "default",
  unpaid: "secondary",
  failed: "destructive",
  authorized: "secondary",
  captured: "default",
};

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: string;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const variant = STATUS_MAP[status.toLowerCase()] ?? "outline";
  return (
    <Badge variant={variant} className={className} {...props}>
      {status}
    </Badge>
  );
}
