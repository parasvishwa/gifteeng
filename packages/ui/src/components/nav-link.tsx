import * as React from "react";
import { cn } from "../lib/cn";

export interface NavLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  isActive?: boolean;
  activeClassName?: string;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  (
    {
      className,
      isActive = false,
      activeClassName,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <a
        ref={ref}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
          isActive &&
            (activeClassName ?? "bg-accent text-accent-foreground"),
          className,
        )}
        {...props}
      >
        {children}
      </a>
    );
  },
);
NavLink.displayName = "NavLink";
