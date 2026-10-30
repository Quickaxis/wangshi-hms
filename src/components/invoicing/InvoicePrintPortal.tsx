"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DbInvoice, Homestay } from "@/lib/types";
import { InvoicePDFView } from "./InvoicePDFView";

interface InvoicePrintPortalProps {
  invoice: DbInvoice | null;
  homestay?: Homestay | null;
}

export interface TriggerBrowserPrintOptions {
  targetContainerId?: string;
  invoiceNumber?: string | null;
}

/**
 * Sanitizes an invoice number for safe cross-platform file naming.
 * - Replaces filesystem-illegal characters (< > : " / \ | ? * and control chars) with hyphens.
 * - Collapses multiple consecutive hyphens.
 * - Strips trailing .pdf extension if present to prevent double extensions (.pdf.pdf).
 * - Strips leading/trailing dots, spaces, and hyphens.
 * - Preserves exact valid alphanumeric and hyphen patterns (e.g. INV-THE-20261030-7654).
 */
export function sanitizeInvoiceFilename(rawNumber?: string | null): string {
  if (!rawNumber || typeof rawNumber !== "string" || !rawNumber.trim()) {
    return "invoice";
  }

  let sanitized = rawNumber
    .trim()
    .replace(/\.pdf$/i, "") // Strip pre-existing .pdf extension
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-") // Replace illegal characters with hyphens
    .replace(/-+/g, "-") // Collapse duplicate hyphens
    .replace(/^[.\s-]+|[.\s-]+$/g, ""); // Strip leading/trailing dots, spaces, hyphens

  return sanitized || "invoice";
}

/**
 * Triggers clean browser printing for an invoice document.
 * 1. Ensures fonts and images are fully decoded before opening print dialog.
 * 2. Sets document.title to the sanitized invoice number so Chrome's Save as PDF
 *    dialog suggests "{invoice_number}.pdf" as the default filename.
 * 3. Unlocks body overflow constraints.
 * 4. Restores screen state and previous document.title upon completion.
 */
export async function triggerBrowserPrint(
  targetOrOptions?: string | TriggerBrowserPrintOptions,
  maybeInvoiceNumber?: string | null
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Resolve arguments
  let targetContainerId = "hms-invoice-print-root";
  let targetInvoiceNumber: string | null | undefined = undefined;

  if (typeof targetOrOptions === "object" && targetOrOptions !== null) {
    targetContainerId = targetOrOptions.targetContainerId || "hms-invoice-print-root";
    targetInvoiceNumber = targetOrOptions.invoiceNumber;
  } else if (typeof targetOrOptions === "string") {
    targetContainerId = targetOrOptions;
    targetInvoiceNumber = maybeInvoiceNumber;
  }

  // Fallback: If invoiceNumber not passed directly, read from portal's data attribute
  const container = document.getElementById(targetContainerId) || document.body;
  if (!targetInvoiceNumber && container) {
    targetInvoiceNumber = container.getAttribute("data-invoice-number");
  }

  // 1. Wait for web fonts to load
  if (document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // Non-blocking fallback
    }
  }

  // 2. Wait for all images in the print root or target to be loaded and decoded
  if (container) {
    const images = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  }

  // 3. Mark body for print styling & dynamically set title for Save as PDF filename
  const originalOverflow = document.body.style.overflow;
  const originalTitle = document.title;
  const sanitizedFilename = sanitizeInvoiceFilename(targetInvoiceNumber);

  document.body.classList.add("hms-printing-invoice");
  document.body.style.overflow = "visible";
  document.title = sanitizedFilename;

  // 4. Cleanup helper to restore original title and overflow
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.body.classList.remove("hms-printing-invoice");
    document.body.style.overflow = originalOverflow;
    document.title = originalTitle;
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);

  // 5. Small frame delay so layout tree reflows stably before Chrome rasterizes
  requestAnimationFrame(() => {
    window.print();
    // Safety fallback cleanup in case afterprint does not fire (e.g. cancelled)
    setTimeout(cleanup, 2000);
  });
}

/**
 * Mounts a clean, unconstrained invoice document directly at document.body.
 * When media is "screen", this portal is display: none.
 * When media is "print", this portal is the ONLY visible document in normal flow.
 * Also attaches beforeprint/afterprint listeners so keyboard printing (Ctrl+P)
 * automatically suggests "{invoice_number}.pdf".
 */
export function InvoicePrintPortal({ invoice, homestay }: InvoicePrintPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut (Ctrl+P / Cmd+P) listener to set dynamic document title
  useEffect(() => {
    if (!invoice?.invoice_number || typeof window === "undefined") return;

    let previousTitle = document.title;
    const handleBeforePrint = () => {
      previousTitle = document.title;
      document.title = sanitizeInvoiceFilename(invoice.invoice_number);
    };

    const handleAfterPrint = () => {
      document.title = previousTitle;
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      if (document.title === sanitizeInvoiceFilename(invoice.invoice_number)) {
        document.title = previousTitle;
      }
    };
  }, [invoice?.invoice_number]);

  if (!mounted || !invoice || typeof document === "undefined") {
    return null;
  }

  const sanitizedInvoiceNumber = sanitizeInvoiceFilename(invoice.invoice_number);

  return createPortal(
    <div 
      id="hms-invoice-print-root" 
      className="hms-print-only"
      data-invoice-number={sanitizedInvoiceNumber}
    >
      <InvoicePDFView 
        invoice={invoice} 
        homestay={homestay} 
        isPrintVersion={true}
      />
    </div>,
    document.body
  );
}
