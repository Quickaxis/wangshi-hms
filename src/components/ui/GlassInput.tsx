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
          <label className="text-sm font-medium text-[#24213A] ml-2">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-4 text-[#77758F] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full rounded-[14px] bg-[#FFFFFF] border border-[#E8E7F2]",
              "px-4 py-2.5 text-sm text-[#24213A] placeholder:text-[#8F8CA4]",
              "transition-all focus:outline-none focus:border-[#5146D8] focus:ring-2 focus:ring-[#5146D8]/10 shadow-sm",
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
