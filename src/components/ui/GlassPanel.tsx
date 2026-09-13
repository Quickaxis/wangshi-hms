import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "primary" | "secondary" | "strong";
}

const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[28px] text-primary",
          {
            "glass-panel": variant === "primary",
            "glass-panel-secondary": variant === "secondary",
            "glass-panel-strong": variant === "strong",
          },
          className
        )}
        {...props}
      />
    );
  }
);

GlassPanel.displayName = "GlassPanel";

export { GlassPanel };
