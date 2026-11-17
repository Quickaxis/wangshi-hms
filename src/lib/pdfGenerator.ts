"use client";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Cache for converted colors to prevent redundant canvas operations.
 */
const colorConversionCache = new Map<string, string>();
let convCanvas: HTMLCanvasElement | null = null;
let convCtx: CanvasRenderingContext2D | null = null;

/**
 * Converts modern CSS colors (lab, lch, oklab, oklch) to browser-compatible sRGB rgba()
 * using an off-screen 1x1 canvas context.
 */
function parseColorToRgba(rawColor: string): string {
  if (!rawColor || typeof rawColor !== "string") return rawColor;
  const trimmed = rawColor.trim();
  if (!trimmed) return trimmed;

  if (colorConversionCache.has(trimmed)) {
    return colorConversionCache.get(trimmed)!;
  }

  if (typeof document !== "undefined" && !convCtx) {
    convCanvas = document.createElement("canvas");
    convCanvas.width = 1;
    convCanvas.height = 1;
    convCtx = convCanvas.getContext("2d", { willReadFrequently: true });
  }

  if (!convCtx) return trimmed;

  try {
    convCtx.clearRect(0, 0, 1, 1);
    convCtx.fillStyle = trimmed;
    convCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = convCtx.getImageData(0, 0, 1, 1).data;
    const alpha = (a / 255).toFixed(3).replace(/\.?0+$/, "");
    const res = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha || 0})`;
    colorConversionCache.set(trimmed, res);
    return res;
  } catch {
    return trimmed;
  }
}

/**
 * Regular expression to detect unsupported color functions: lab(), lch(), oklab(), oklch()
 */
const UNSUPPORTED_COLOR_REGEX = /(?:lab|lch|oklab|oklch)\([^)]+\)/gi;

/**
 * Replaces any unsupported color function in a CSS declaration string (including
 * gradients, box-shadows, and borders) with its browser-compatible sRGB equivalent.
 */
function sanitizeCssString(cssValue: string): string {
  if (!cssValue || typeof cssValue !== "string") return cssValue;
  if (!UNSUPPORTED_COLOR_REGEX.test(cssValue)) return cssValue;
  UNSUPPORTED_COLOR_REGEX.lastIndex = 0;
  return cssValue.replace(UNSUPPORTED_COLOR_REGEX, (match) => {
    return parseColorToRgba(match);
  });
}

/**
 * Proxies a native CSSStyleDeclaration so that any property read or method invocation
 * that returns an unsupported lab/oklch color function is transparently converted to sRGB.
 */
function createStyleProxy(origDecl: CSSStyleDeclaration): CSSStyleDeclaration {
  return new Proxy(origDecl, {
    get(target, prop) {
      const val = (target as any)[prop];
      if (typeof val === "function") {
        return function (...args: any[]) {
          const res = val.apply(target, args);
          if (typeof res === "string" && /(?:lab|lch|oklab|oklch)\(/i.test(res)) {
            return sanitizeCssString(res);
          }
          return res;
        };
      }
      if (typeof val === "string" && /(?:lab|lch|oklab|oklch)\(/i.test(val)) {
        return sanitizeCssString(val);
      }
      return val;
    },
  });
}

/**
 * Critical color properties evaluated by html2canvas CSSParsedDeclaration.
 */
const COLOR_PROPS = [
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "background-image",
  "fill",
  "stroke",
];

/**
 * Ensures all web fonts and images within a target container are loaded and decoded
 * before capturing with html2canvas.
 */
async function waitForAssets(container: HTMLElement): Promise<void> {
  // 1. Wait for web fonts
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // Non-blocking fallback
    }
  }

  // 2. Wait for all images inside container
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })
  );
}

/**
 * Generates an A4 PDF Blob from a target HTML element using html2canvas and jsPDF.
 * Implements robust color normalization to prevent html2canvas "unsupported color function lab/oklch" errors.
 */
export async function generateElementPdfBlob(
  targetElement: HTMLElement
): Promise<Blob> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF generation is only supported in browser environments.");
  }

  // Wait for all typography and images to be decoded
  await waitForAssets(targetElement);

  // Hook global getComputedStyle during capture to intercept unsupported colors
  const origWinGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
    const decl = origWinGetComputedStyle.call(window, elt, pseudoElt);
    return createStyleProxy(decl);
  };

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(targetElement, {
      scale: 2, // 2x for retina / print-quality sharpness
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 1024,
      onclone: (clonedDoc, clonedElement) => {
        // 1. Hook getComputedStyle on the cloned iframe window
        const cloneWin = clonedDoc.defaultView;
        if (cloneWin && cloneWin !== window) {
          const origCloneGetComputedStyle = cloneWin.getComputedStyle;
          cloneWin.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
            const decl = origCloneGetComputedStyle.call(cloneWin, elt, pseudoElt);
            return createStyleProxy(decl);
          };
        }

        // 2. Normalize unsupported color functions in cloned document stylesheets
        const styleEls = clonedDoc.querySelectorAll("style");
        styleEls.forEach((styleEl) => {
          if (styleEl.textContent && /(?:lab|lch|oklab|oklch)\(/i.test(styleEl.textContent)) {
            styleEl.textContent = sanitizeCssString(styleEl.textContent);
          }
        });

        // 3. Position cloned element cleanly for A4 desktop layout
        if (clonedElement) {
          clonedElement.style.position = "static";
          clonedElement.style.left = "0";
          clonedElement.style.top = "0";
          clonedElement.style.margin = "0 auto";
          clonedElement.style.width = "794px"; // Standard A4 96 DPI pixel width
          if (clonedElement.parentElement) {
            clonedElement.parentElement.style.position = "static";
            clonedElement.parentElement.style.left = "0";
            clonedElement.parentElement.style.top = "0";
          }

          // 4. Sanitize inline and computed styles on all cloned descendant elements
          const allElements = [clonedElement, ...Array.from(clonedElement.querySelectorAll("*"))];
          for (const el of allElements) {
            if (el instanceof HTMLElement || el instanceof SVGElement) {
              // Sanitize any existing inline styles
              if (el.style) {
                for (let i = 0; i < el.style.length; i++) {
                  const prop = el.style[i];
                  const val = el.style.getPropertyValue(prop);
                  if (val && /(?:lab|lch|oklab|oklch)\(/i.test(val)) {
                    el.style.setProperty(prop, sanitizeCssString(val), el.style.getPropertyPriority(prop));
                  }
                }
              }

              // Explicitly normalize any computed lab/oklch colors directly onto the clone element
              try {
                const comp = origWinGetComputedStyle.call(window, el);
                for (const prop of COLOR_PROPS) {
                  const computedVal = comp.getPropertyValue(prop);
                  if (computedVal && /(?:lab|lch|oklab|oklch)\(/i.test(computedVal)) {
                    el.style.setProperty(prop, sanitizeCssString(computedVal), "important");
                  }
                }
              } catch {
                // Non-blocking fallback
              }
            }
          }
        }
      },
    });
  } finally {
    // Restore original window.getComputedStyle immediately
    window.getComputedStyle = origWinGetComputedStyle;
  }

  // A4 dimensions in mm: 210 x 297
  const pdfWidthMm = 210;
  const pdfHeightMm = 297;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const imgHeightMm = (canvas.height * pdfWidthMm) / canvas.width;

  let heightLeft = imgHeightMm;
  let position = 0;

  // First page
  doc.addImage(imgData, "JPEG", 0, position, pdfWidthMm, imgHeightMm);
  heightLeft -= pdfHeightMm;

  // Subsequent pages if content overflows A4 height
  while (heightLeft > 0) {
    position -= pdfHeightMm;
    doc.addPage();
    doc.addImage(imgData, "JPEG", 0, position, pdfWidthMm, imgHeightMm);
    heightLeft -= pdfHeightMm;
  }

  return doc.output("blob");
}

/**
 * Downloads a generated PDF blob to the user's device (phone/desktop).
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const cleanFilename = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cleanFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Cleanup after trigger
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 10000);
}

/**
 * Shares a PDF blob using the browser's native Web Share API (mobile share sheet).
 * If sharing files is not supported or rejected, it can fall back to downloading directly.
 */
export async function sharePdfBlob(
  blob: Blob,
  filename: string,
  title: string = "Guest Folio"
): Promise<{ shared: boolean; downloadedFallback: boolean }> {
  const cleanFilename = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`;

  const file = new File([blob], cleanFilename, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: title,
        text: `Guest Folio: ${cleanFilename.replace(/\.pdf$/i, "")}`,
      });
      return { shared: true, downloadedFallback: false };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // User dismissed the native share sheet - not an error
        return { shared: false, downloadedFallback: false };
      }
      // If native sharing failed unexpectedly, fall back to download
      downloadPdfBlob(blob, cleanFilename);
      return { shared: false, downloadedFallback: true };
    }
  }

  // Fallback: If Web Share API or file sharing is not supported by device/browser
  downloadPdfBlob(blob, cleanFilename);
  return { shared: false, downloadedFallback: true };
}
