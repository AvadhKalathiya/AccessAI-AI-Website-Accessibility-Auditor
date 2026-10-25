import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "success" | "warning" | "error" | "info";
}

export function Badge({
  className,
  variant = "neutral",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    neutral:
      "bg-muted text-muted-foreground border-border",
    success:
      "bg-success/15 text-success border-success/30 font-medium",
    warning:
      "bg-warning/15 text-warning border-warning/30 font-medium",
    error:
      "bg-destructive/15 text-destructive border-destructive/30 font-medium",
    info:
      "bg-info/15 text-info border-info/30 font-medium",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border tracking-wide select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
