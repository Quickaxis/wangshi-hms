import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps extends HTMLAttributes<HTMLDivElement> {
  status: "available" | "booked";
}

const StatusBadge = forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ className, status, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold",
          {
            // Available: subtle green background with brighter text
            "bg-[rgba(127,227,157,0.15)] text-[#7FE39D] border border-[rgba(127,227,157,0.2)]":
              status === "available",
            // Booked: subtle rose background with brighter text
            "bg-[rgba(241,143,155,0.15)] text-[#F18F9B] border border-[rgba(241,143,155,0.2)]":
              status === "booked",
          },
          className
        )}
        {...props}
      >
        <span
          className={cn("w-1.5 h-1.5 rounded-full mr-2", {
            "bg-[#4FE77B]": status === "available",
            "bg-[#FF6978]": status === "booked",
          })}
        />
        {children || (status === "available" ? "Available" : "Booked")}
      </div>
    );
  }
);

StatusBadge.displayName = "StatusBadge";

export { StatusBadge };
