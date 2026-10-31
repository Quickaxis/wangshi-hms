"use client";

import { useState } from "react";
import Image from "next/image";
import { BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomImageProps {
  imageUrl?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
}

export function RoomImage({
  imageUrl,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: RoomImageProps) {
  const [imgError, setImgError] = useState(false);

  const hasValidImage = Boolean(imageUrl && imageUrl.trim().length > 0 && !imgError);

  if (!hasValidImage) {
    return (
      <div
        className={cn(
          "w-full h-full bg-gradient-to-br from-[rgba(255,255,255,0.03)] to-[rgba(0,0,0,0.4)] flex flex-col items-center justify-center p-3 text-center border border-[rgba(255,255,255,0.05)] select-none",
          className
        )}
      >
        <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center mb-1.5 shadow-inner">
          <BedDouble className="w-5 h-5 text-[#96928A]/70" />
        </div>
        <span className="text-[#96928A] text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase">
          No Photo
        </span>
      </div>
    );
  }

  return (
    <Image
      src={imageUrl!}
      alt={alt}
      fill
      unoptimized
      className={cn("object-cover transition-opacity duration-300", className)}
      sizes={sizes}
      onError={() => setImgError(true)}
    />
  );
}
