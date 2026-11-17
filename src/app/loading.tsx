import Image from "next/image";

export default function Loading() {
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 mb-4 relative flex items-center justify-center">
          <div className="absolute -inset-2 rounded-2xl border-2 border-[#5146D8] border-t-transparent animate-spin" />
          <Image
            src="/logos/compactlogo.png"
            alt="HOSPIRO"
            width={48}
            height={48}
            className="w-12 h-12 object-contain drop-shadow-[0_4px_12px_rgba(81,70,216,0.22)]"
            priority
          />
        </div>
        <span className="text-base font-bold text-[#252342] tracking-wide block">HOSPIRO</span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#77758F] font-semibold block mt-0.5 mb-3">
          Hotel Management System
        </span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5146D8] animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#5146D8] animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#5146D8] animate-bounce" />
        </div>
      </div>
    </div>
  );
}

