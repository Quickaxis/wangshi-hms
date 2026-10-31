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
            // Primary: Finnova Indigo button
            "bg-[#5146D8] text-white hover:bg-[#4338CA] shadow-[0_4px_14px_rgba(81,70,216,0.25)]": variant === "primary",
            // Secondary: Clean white with soft border and lavender hover
            "bg-[#FFFFFF] border border-[#E8E7F2] hover:bg-[#F0EEFF] hover:border-[#8B83F6] hover:text-[#5146D8] text-[#24213A] shadow-sm": variant === "secondary",
            // Danger: Semantic rose button
            "bg-[#EF4444] text-white hover:bg-[#DC2626] shadow-[0_2px_10px_rgba(239,68,68,0.2)]": variant === "danger",
            // Ghost: Transparent with subtle lavender hover
            "bg-transparent hover:bg-[#F0EEFF] hover:text-[#5146D8] text-[#24213A]": variant === "ghost",
            
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
