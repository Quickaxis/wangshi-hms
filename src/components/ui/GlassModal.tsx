import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100000] isolate">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[rgba(0,0,0,0.65)]"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div 
        className={cn(
          "fixed left-[50%] bottom-0 translate-x-[-50%] w-full max-w-[430px] sm:max-w-lg max-h-[92dvh] sm:max-h-[85vh] sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] flex flex-col bg-[#100D0B] rounded-t-[24px] sm:rounded-b-[24px] shadow-2xl overflow-hidden border-t sm:border border-[rgba(255,255,255,0.1)] z-[100010] opacity-100", 
          className
        )}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-6 py-4 sm:py-5 bg-[#100D0B] relative z-10">
          <h2 className="text-lg font-semibold tracking-wide text-[#F5F1E8]">{title}</h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[rgba(255,255,255,0.1)] text-[#96928A] hover:text-[#F5F1E8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto bg-[#100D0B] overscroll-contain hide-scrollbar" 
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="p-6">
            {children}
          </div>
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 relative z-10 flex items-center justify-end gap-3 border-t border-[rgba(255,255,255,0.08)] bg-[#100D0B] pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
