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
          <label className="text-xs font-semibold uppercase tracking-wider text-[#77758F] ml-1">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3.5 text-[#77758F] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full h-10 rounded-xl bg-[#FFFFFF] border border-[#E8E6F2]",
              "px-3.5 py-2 text-sm text-[#24213A] placeholder:text-[#77758F]/60",
              "transition-all focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm",
              icon && "pl-10",
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
