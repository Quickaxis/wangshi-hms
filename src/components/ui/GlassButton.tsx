import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-95",
          {
            // Primary: Cream button with dark text
            "bg-[#F2EEE3] text-[#22211E] hover:bg-white shadow-[0_2px_10px_rgba(255,255,255,0.1)]": variant === "primary",
            // Secondary: Glass button
            "glass-panel hover:bg-[rgba(255,255,255,0.1)] text-[#F5F1E8]": variant === "secondary",
            // Danger: Subtle rose button
            "bg-[#F18F9B] text-white hover:bg-[#FF6978] shadow-[0_2px_10px_rgba(241,143,155,0.2)]": variant === "danger",
            // Ghost: Transparent with hover
            "bg-transparent hover:bg-[rgba(255,255,255,0.05)] text-[#F5F1E8]": variant === "ghost",
            
            // Sizes
            "h-8 px-4 text-xs": size === "sm",
            "h-10 px-6 text-sm": size === "md",
            "h-12 px-8 text-base": size === "lg",
            "h-10 w-10 p-2": size === "icon",
          },
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

GlassButton.displayName = "GlassButton";

export { GlassButton };
