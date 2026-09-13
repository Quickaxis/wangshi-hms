import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  label?: string;
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, icon, label, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-sm font-medium text-[#C7C3BA] ml-2">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-4 text-[#96928A] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full rounded-[14px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]",
              "px-4 py-2.5 text-sm text-[#F5F1E8] placeholder:text-[#96928A]",
              "transition-all focus:outline-none focus:border-[rgba(255,255,255,0.25)] focus:bg-[rgba(255,255,255,0.08)]",
              icon && "pl-11",
              className
            )}
            {...props}
          />
        </div>
      </div>
    );
  }
);

GlassInput.displayName = "GlassInput";

export { GlassInput };
