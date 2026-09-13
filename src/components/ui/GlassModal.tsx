import { useEffect, useRef } from "react";
import { GlassPanel } from "./GlassPanel";
import { GlassButton } from "./GlassButton";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function GlassModal({ isOpen, onClose, title, children, footer, className }: GlassModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      <div className={cn("relative z-[101] w-full max-w-lg animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
        <GlassPanel className="p-0 overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.6)] rounded-[24px] border border-[rgba(255,255,255,0.15)] bg-[rgba(8,7,6,0.85)] backdrop-blur-3xl">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] px-6 py-5">
            <h2 className="text-lg font-semibold tracking-wide text-[#F5F1E8]">{title}</h2>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[rgba(255,255,255,0.1)] text-[#96928A] hover:text-[#F5F1E8] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="px-6 py-6 overflow-y-auto max-h-[calc(100vh-200px)] hide-scrollbar">
            {children}
          </div>

          {footer && (
            <div className="flex items-center justify-end gap-3 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.2)] px-6 py-4">
              {footer}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
