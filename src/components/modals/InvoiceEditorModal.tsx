"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { 
  DbInvoice, 
  DbBooking, 
  CreateInvoiceItemInput, 
  InvoiceItemCategory, 
  PaymentMethod,
  PaymentStage,
  PaymentReceiptData,
  DbPayment
} from "@/lib/types";
import { 
  createInvoiceAction, 
  updateInvoiceAction, 
  recordInvoicePaymentAction,
  getOrCreateBookingFolioAction,
  addFolioChargeAction,
  updateFolioChargeAction,
  removeFolioChargeAction,
  finalizeFolioInvoiceAction
} from "@/app/actions/invoices";
import { calculateInvoiceTotals, extractPaymentStage, stripPaymentStageTag } from "@/lib/money";
import { formatISTCompactDate, formatISTPaymentTimestamp, formatReceiptNumber } from "@/lib/dateUtils";
import { getPaymentReceiptDataAction } from "@/app/actions/payments";
import { PaymentReceiptModal } from "./PaymentReceiptModal";
import { getStageBadgeDetails } from "../payments/PaymentReceiptView";
import { createClient } from "@/lib/supabase/client";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { InvoicePDFView } from "@/components/invoicing/InvoicePDFView";
import { InvoicePrintPortal, triggerBrowserPrint, sanitizeInvoiceFilename } from "@/components/invoicing/InvoicePrintPortal";
import { generateElementPdfBlob, downloadPdfBlob, sharePdfBlob } from "@/lib/pdfGenerator";
import { 
  ArrowLeft,
  Plus, 
  Trash2, 
  CreditCard, 
  Receipt, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ShieldAlert,
  Eye,
  Printer,
  FileText,
  User,
  BedDouble,
  X,
  Pencil,
  Sparkles,
  Check,
  Save,
  Download,
  Share2,
  Phone,
  Mail,
  Calendar,
  Users,
  History,
  AlertTriangle,
  Tag,
  ChevronDown,
  ChevronUp,
  Utensils,
  Shirt,
  Maximize2,
  Minimize2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking?: DbBooking | null;
  existingInvoice?: DbInvoice | null;
  initialTab?: "items" | "payments";
  onSaved: (invoiceId: string, updatedInvoice?: DbInvoice, shouldClose?: boolean) => void;
}

const ADDITIONAL_SERVICE_CATEGORY_OPTIONS: { label: string; value: InvoiceItemCategory; icon: any }[] = [
  { label: "Food & Beverages", value: "food_beverage", icon: Utensils },
  { label: "Laundry Service", value: "laundry", icon: Shirt },
  { label: "Extra Bed / Mattress", value: "extra_bed", icon: BedDouble },
  { label: "Transport & Custom Services", value: "custom", icon: Sparkles },
  { label: "Stay Extension", value: "additional_nights", icon: Calendar },
  { label: "Concession / Discount", value: "discount", icon: Tag },
];

const DEFAULT_SUGGESTED_ITEMS = [
  { name: "Breakfast", cat: "food_beverage" as InvoiceItemCategory, rate: 250 },
  { name: "Traditional Dinner", cat: "food_beverage" as InvoiceItemCategory, rate: 450 },
  { name: "Tea & Snacks", cat: "food_beverage" as InvoiceItemCategory, rate: 100 },
  { name: "Laundry (Wash & Iron)", cat: "laundry" as InvoiceItemCategory, rate: 300 },
  { name: "Airport Pickup Taxi", cat: "custom" as InvoiceItemCategory, rate: 1500 },
  { name: "Airport Drop Taxi", cat: "custom" as InvoiceItemCategory, rate: 1500 },
  { name: "Extra Mattress & Bedding", cat: "extra_bed" as InvoiceItemCategory, rate: 600 },
  { name: "Bonfire Evening", cat: "custom" as InvoiceItemCategory, rate: 800 },
];

const ROOM_ADJUSTMENT_REASON_OPTIONS = [
  "Manager Approved Rate",
  "Extended Stay Discount",
  "Corporate Booking Agreement",
  "Seasonal Promotional Offer",
  "Complimentary Upgrade",
  "Other"
] as const;

export function InvoiceEditorModal({
  isOpen,
  onClose,
  booking,
  existingInvoice,
  initialTab,
  onSaved
}: InvoiceEditorModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { homestays, selectedHomestayId } = useHMSContext();

  // Current active folio state
  const [currentFolio, setCurrentFolio] = useState<DbInvoice | null>(existingInvoice || null);
  const [isLoadingFolio, setIsLoadingFolio] = useState(false);

  // Quick Add Folio Charge State
  const [newChargeCat, setNewChargeCat] = useState<InvoiceItemCategory>("food_beverage");
  const [newChargeDesc, setNewChargeDesc] = useState("");
  const [newChargeQty, setNewChargeQty] = useState(1);
  const [newChargeRate, setNewChargeRate] = useState("");
  const [isAddingCharge, setIsAddingCharge] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isEditingGuestInfo, setIsEditingGuestInfo] = useState(false);
  const [userNotes, setUserNotes] = useState("");

  // Edit Additional Service State
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editingChargeIndex, setEditingChargeIndex] = useState<number | null>(null);
  const [editingDesc, setEditingDesc] = useState("");
  const [editingCat, setEditingCat] = useState<InvoiceItemCategory>("custom");
  const [editingQty, setEditingQty] = useState(1);
  const [editingRate, setEditingRate] = useState("");
  const [editingStayPeriod, setEditingStayPeriod] = useState("");
  const [editingIsComp, setEditingIsComp] = useState(false);
  const [isUpdatingCharge, setIsUpdatingCharge] = useState(false);

  // Room Rate Adjustment Modal State
  const [adjustingRoomItem, setAdjustingRoomItem] = useState<{
    id?: string;
    index: number;
    description: string;
    rate: number;
    quantity: number;
    amount: number;
    stayPeriod?: string | null;
  } | null>(null);
  const [adjustRateVal, setAdjustRateVal] = useState<string>("");
  const [adjustQtyVal, setAdjustQtyVal] = useState<number>(1);
  const [adjustReasonCategory, setAdjustReasonCategory] = useState<string>("");
  const [adjustCustomReason, setAdjustCustomReason] = useState<string>("");
  const [isAdjustingRate, setIsAdjustingRate] = useState<boolean>(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // View state: Live document preview toggle (visually secondary, defaults to false)
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState<boolean>(false);

  // Background body scroll lock while modal is open & timer cleanup
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, [isOpen]);

  // Collapsible sections
  const [showTaxDiscountPanel, setShowTaxDiscountPanel] = useState<boolean>(false);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestAddress, setGuestAddress] = useState("");
  const [roomName, setRoomName] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [taxRate, setTaxRate] = useState<number>(0);
  const [flatDiscount, setFlatDiscount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [houseRules, setHouseRules] = useState("");
  const [items, setItems] = useState<CreateInvoiceItemInput[]>([]);

  // Payment Recording State
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("partial");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [localPayments, setLocalPayments] = useState<DbPayment[]>([]);

  // Receipt modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceiptData | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Action status states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // PDF generation and mobile sharing states
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSharingFolio, setIsSharingFolio] = useState(false);

  // Homestay branding
  const currentHomestay = useMemo(() => {
    return homestays.find(h => h.id === (existingInvoice?.homestay_id || booking?.homestay_id || selectedHomestayId)) || homestays[0] || null;
  }, [homestays, existingInvoice, booking, selectedHomestayId]);

  // Current active folio or existing invoice reference
  const activeInv = currentFolio || existingInvoice;

  // Derived nights
  const numberOfNights = useMemo(() => {
    if (!checkIn || !checkOut) return 1;
    const d1 = new Date(checkIn).getTime();
    const d2 = new Date(checkOut).getTime();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [checkIn, checkOut]);

  // Separation of contractual room charges vs additional folio services
  const roomCharges = useMemo(() => {
    return items
      .map((item, idx) => ({ item, index: idx }))
      .filter(({ item }) => item.category === "room");
  }, [items]);

  const additionalCharges = useMemo(() => {
    return items
      .map((item, idx) => ({ item, index: idx }))
      .filter(({ item }) => item.category !== "room");
  }, [items]);

  const roomChargesSubtotal = useMemo(() => {
    return roomCharges.reduce((sum, { item }) => sum + (Number(item.amount) || 0), 0);
  }, [roomCharges]);

  const additionalChargesSubtotal = useMemo(() => {
    return additionalCharges.reduce((sum, { item }) => sum + (Number(item.amount) || 0), 0);
  }, [additionalCharges]);

  // Financial calculations
  const calculations = useMemo(() => {
    return calculateInvoiceTotals(
      items,
      taxRate,
      flatDiscount,
      localPayments
    );
  }, [items, taxRate, flatDiscount, localPayments]);

  // Check if group booking
  const isGroupBooking = useMemo(() => {
    return Boolean(activeInv?.group_id || booking?.group_id || roomCharges.length > 1);
  }, [activeInv?.group_id, booking?.group_id, roomCharges.length]);

  // Extract structured audit history from notes
  const auditEntries = useMemo(() => {
    const rawNotes = activeInv?.notes || notes || "";
    if (!rawNotes) return [];
    const chunks = rawNotes.split("\n\n");
    const parsed: Array<{
      id: string;
      title: string;
      timestamp: string;
      actor: string;
      details: string;
      reason?: string;
    }> = [];

    chunks.forEach((chunk, idx) => {
      const match = chunk.match(/^\[(.*?) - (.*?) by (.*?)\]:\s*([\s\S]*)$/);
      if (match) {
        const [, title, timestamp, actor, rest] = match;
        const reasonParts = rest.split(" • Reason: ");
        parsed.push({
          id: `audit-${idx}`,
          title: title.trim(),
          timestamp: timestamp.trim(),
          actor: actor.trim(),
          details: reasonParts[0].trim(),
          reason: reasonParts[1] ? reasonParts[1].trim() : undefined,
        });
      }
    });

    return parsed;
  }, [activeInv?.notes, notes]);

  // General notes (excluding structured audit log blocks)
  const nonAuditNotes = useMemo(() => {
    const rawNotes = activeInv?.notes || notes || "";
    if (!rawNotes) return "";
    return rawNotes
      .split("\n\n")
      .filter(line => !line.trim().startsWith("["))
      .join("\n\n")
      .trim();
  }, [activeInv?.notes, notes]);

  // Detect pending unsaved modifications
  const hasUnsavedChanges = useMemo(() => {
    if (!activeInv) return false;

    const currentGuestName = (activeInv.guest_name || "").trim();
    const currentGuestPhone = (activeInv.guest_phone || "").trim();
    const currentGuestEmail = (activeInv.guest_email || "").trim();
    const currentGuestAddress = (activeInv.guest_address || "").trim();
    const currentTaxRate = Number(activeInv.tax_rate) || 0;

    const existingItemDiscount = (activeInv.items || [])
      .filter((i: any) => i.category === "discount")
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
    const currentFlatDiscount = Math.max(0, (Number(activeInv.discount_amount) || 0) - existingItemDiscount);

    const rawNotes = activeInv.notes || "";
    const currentNonAuditNotes = rawNotes
      .split("\n\n")
      .filter((line: string) => !line.trim().startsWith("["))
      .join("\n\n")
      .trim();

    const nameChanged = guestName.trim() !== currentGuestName;
    const phoneChanged = guestPhone.trim() !== currentGuestPhone;
    const emailChanged = guestEmail.trim() !== currentGuestEmail;
    const addressChanged = guestAddress.trim() !== currentGuestAddress;
    const taxChanged = Math.abs(taxRate - currentTaxRate) > 0.001;
    const discountChanged = Math.abs(flatDiscount - currentFlatDiscount) > 0.001;
    const notesChanged = (userNotes || "").trim() !== currentNonAuditNotes;

    return nameChanged || phoneChanged || emailChanged || addressChanged || taxChanged || discountChanged || notesChanged;
  }, [activeInv, guestName, guestPhone, guestEmail, guestAddress, taxRate, flatDiscount, userNotes]);

  // Populate form fields from a loaded invoice / folio
  const populateFromInvoice = useCallback((inv: DbInvoice) => {
    setInvoiceNumber(inv.invoice_number || "");
    setInvoiceDate(inv.invoice_date || new Date().toISOString().split("T")[0]);
    setDueDate(inv.check_out || inv.invoice_date || "");
    setGuestName(inv.guest_name || "");
    setGuestPhone(inv.guest_phone || "");
    setGuestEmail(inv.guest_email || "");
    setGuestAddress(inv.guest_address || "");
    setRoomName(inv.room_name || "");
    setCheckIn(inv.check_in || "");
    setCheckOut(inv.check_out || "");
    setTaxRate(Number(inv.tax_rate) || 0);

    const existingItemDiscount = (inv.items || [])
      .filter(i => i.category === 'discount')
      .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const derivedFlatDiscount = Math.max(0, (Number(inv.discount_amount) || 0) - existingItemDiscount);
    setFlatDiscount(derivedFlatDiscount);

    setNotes(inv.notes || "");
    const rawNotes = inv.notes || "";
    const cleanUserNotes = rawNotes
      .split("\n\n")
      .filter(line => !line.trim().startsWith("["))
      .join("\n\n")
      .trim();
    setUserNotes(cleanUserNotes);

    setHouseRules(inv.house_rules || "");
    setLocalPayments(inv.payments || []);

    const mappedItems = (inv.items || []).map(i => ({
      id: i.id,
      category: i.category,
      description: i.description,
      stay_period: i.stay_period,
      quantity: Number(i.quantity) || 1,
      rate: Number(i.rate) || 0,
      amount: Number(i.amount) || 0,
      sort_order: i.sort_order,
      is_complimentary: Number(i.rate) === 0 && i.category !== 'discount'
    }));
    setItems(mappedItems);
  }, []);

  // Initialize and load folio
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setPaymentError(null);
    setPaymentSuccess(null);
    setPaymentAmount("");
    setPaymentRef("");
    setPaymentNotes("");
    setAdjustingRoomItem(null);
    setEditingChargeId(null);
    setIsEditingGuestInfo(false);
    setIsSavingChanges(false);

    if (existingInvoice) {
      setCurrentFolio(existingInvoice);
      populateFromInvoice(existingInvoice);
    } else if (booking) {
      setIsLoadingFolio(true);
      getOrCreateBookingFolioAction(booking.id).then((res) => {
        setIsLoadingFolio(false);
        if (res.success && res.invoice) {
          setCurrentFolio(res.invoice);
          populateFromInvoice(res.invoice);
        }
      }).catch((err) => {
        setIsLoadingFolio(false);
        console.error("Folio auto-fetch error:", err);
      });
    }
  }, [isOpen, existingInvoice, booking, populateFromInvoice]);

  // Set suggested payment amount when balance changes
  useEffect(() => {
    if (calculations.balanceDue > 0 && !paymentAmount) {
      // Default payment stage based on check-in
      const today = new Date().toISOString().split("T")[0];
      if (checkIn && today < checkIn) {
        setPaymentStage("advance");
      } else if (checkOut && today >= checkOut) {
        setPaymentStage("final");
      } else {
        setPaymentStage("partial");
      }
    }
  }, [calculations.balanceDue, checkIn, checkOut, paymentAmount]);

  // Quick Action: Pay Full Remaining Balance
  const handleSetFullBalance = () => {
    if (calculations.balanceDue > 0) {
      setPaymentAmount(calculations.balanceDue.toFixed(2));
      const today = new Date().toISOString().split("T")[0];
      if (checkOut && today >= checkOut) {
        setPaymentStage("final");
      } else {
        setPaymentStage("partial");
      }
    }
  };

  // Quick Action: Set Preset Amount
  const handleSetPresetAmount = (preset: number) => {
    const capped = Math.min(preset, calculations.balanceDue > 0 ? calculations.balanceDue : preset);
    setPaymentAmount(capped.toFixed(2));
  };

  // Handler: Add Additional Folio Service
  const handleAddFolioCharge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newChargeDesc.trim()) {
      setErrorMsg("Please enter a description for the additional service.");
      return;
    }
    const rateNum = Number(newChargeRate);
    if (isNaN(rateNum) || rateNum < 0) {
      setErrorMsg("Unit rate cannot be negative.");
      return;
    }
    if (newChargeQty < 1) {
      setErrorMsg("Quantity must be at least 1.");
      return;
    }

    setIsAddingCharge(true);
    setErrorMsg(null);

    try {
      const activeInv = currentFolio || existingInvoice;
      if (activeInv?.id) {
        const res = await addFolioChargeAction({
          invoiceId: activeInv.id,
          category: newChargeCat,
          description: newChargeDesc.trim(),
          quantity: newChargeQty,
          rate: rateNum,
        });

        if (res.success && res.invoice) {
          setCurrentFolio(res.invoice);
          populateFromInvoice(res.invoice);
          setSuccessMsg(`Added "${newChargeDesc.trim()}" to guest folio.`);
          setNewChargeDesc("");
          setNewChargeRate("");
          setNewChargeQty(1);
          onSaved(activeInv.id, res.invoice, false);
        } else {
          setErrorMsg(res.error || "Failed to add charge to folio.");
        }
      } else {
        // In-memory fallback
        const itemAmount = Number((newChargeQty * rateNum).toFixed(2));
        const newItem: CreateInvoiceItemInput = {
          category: newChargeCat,
          description: newChargeDesc.trim(),
          quantity: newChargeQty,
          rate: rateNum,
          amount: itemAmount,
          sort_order: items.length,
          is_complimentary: rateNum === 0
        };
        setItems([...items, newItem]);
        setSuccessMsg(`Added "${newChargeDesc.trim()}" to folio.`);
        setNewChargeDesc("");
        setNewChargeRate("");
        setNewChargeQty(1);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to add charge.");
    } finally {
      setIsAddingCharge(false);
    }
  };

  // Derived values for the currently adjusting room
  const currentAdjustOldRate = adjustingRoomItem ? adjustingRoomItem.rate : 0;
  const currentAdjustOldQty = adjustingRoomItem ? adjustingRoomItem.quantity : 1;
  const currentAdjustOldTotal = adjustingRoomItem ? adjustingRoomItem.amount : 0;

  const currentAdjustNewRate = Number(adjustRateVal);
  const currentAdjustNewQty = Math.max(1, Number(adjustQtyVal) || 1);
  const currentAdjustNewTotal = isNaN(currentAdjustNewRate) || currentAdjustNewRate < 0 ? 0 : Number((currentAdjustNewRate * currentAdjustNewQty).toFixed(2));
  const currentAdjustDiff = Number((currentAdjustNewTotal - currentAdjustOldTotal).toFixed(2));

  // Clean room title
  const currentAdjustRoomTitle = useMemo(() => {
    if (!adjustingRoomItem) return "Room";
    return adjustingRoomItem.description
      .replace(/^Room:\s*/i, "")
      .replace(/\s*\([0-9-]+\s*to\s*[0-9-]+\)\s*$/, "")
      .trim() || adjustingRoomItem.description;
  }, [adjustingRoomItem]);

  // Hypothetical new folio grand total
  const hypotheticalFolioTotal = useMemo(() => {
    if (!adjustingRoomItem) return calculations.grandTotal;
    const oldAmt = adjustingRoomItem.amount;
    const newAmt = currentAdjustNewTotal;
    const newSubtotal = Math.max(0, calculations.subtotal - oldAmt + newAmt);
    const newTax = Number(((newSubtotal * (Number(taxRate) || 0)) / 100).toFixed(2));
    return Math.max(0, Number((newSubtotal + newTax - (Number(flatDiscount) || 0)).toFixed(2)));
  }, [adjustingRoomItem, currentAdjustNewTotal, calculations.subtotal, calculations.grandTotal, taxRate, flatDiscount]);

  const isAdjustmentDecreasing = currentAdjustDiff < 0;
  const isBelowPaidAmount = hypotheticalFolioTotal < calculations.amountPaid;

  const isAdjustRateValid = !isNaN(currentAdjustNewRate) && currentAdjustNewRate >= 0 && adjustRateVal.trim() !== "";
  const isAdjustQtyValid = currentAdjustNewQty >= 1;
  const isAdjustReasonValid = 
    adjustReasonCategory !== "" && 
    (adjustReasonCategory !== "Other" || adjustCustomReason.trim().length > 0);

  const canSaveAdjustment = isAdjustRateValid && isAdjustQtyValid && isAdjustReasonValid && !isBelowPaidAmount && !isAdjustingRate;

  const effectiveAdjustmentReason = useMemo(() => {
    if (adjustReasonCategory === "Other") {
      return adjustCustomReason.trim();
    }
    if (adjustCustomReason.trim()) {
      return `${adjustReasonCategory} - ${adjustCustomReason.trim()}`;
    }
    return adjustReasonCategory;
  }, [adjustReasonCategory, adjustCustomReason]);

  // Handler: Open Room Rate Adjustment Dialog
  const handleOpenRoomAdjustment = (item: CreateInvoiceItemInput, index: number) => {
    setAdjustingRoomItem({
      id: item.id,
      index,
      description: item.description,
      rate: Number(item.rate) || 0,
      quantity: Number(item.quantity) || 1,
      amount: Number(item.amount) || (Number(item.rate) || 0) * (Number(item.quantity) || 1),
      stayPeriod: item.stay_period || null,
    });
    setAdjustRateVal(String(item.rate || ""));
    setAdjustQtyVal(Number(item.quantity) || numberOfNights || 1);
    setAdjustReasonCategory("");
    setAdjustCustomReason("");
    setAdjustError(null);
  };

  // Handler: Save Room Rate Adjustment with Audit Log
  const handleSaveRoomAdjustment = async () => {
    if (!adjustingRoomItem || !canSaveAdjustment) return;

    setIsAdjustingRate(true);
    setAdjustError(null);

    try {
      const activeInv = currentFolio || existingInvoice;
      if (activeInv?.id && adjustingRoomItem.id && !adjustingRoomItem.id.startsWith("local-") && !adjustingRoomItem.id.startsWith("preview-item-")) {
        const res = await updateFolioChargeAction({
          invoiceId: activeInv.id,
          itemId: adjustingRoomItem.id,
          category: 'room',
          description: adjustingRoomItem.description,
          rate: currentAdjustNewRate,
          quantity: currentAdjustNewQty,
          stayPeriod: adjustingRoomItem.stayPeriod,
          reason: effectiveAdjustmentReason,
        });

        if (res.success && res.invoice) {
          setCurrentFolio(res.invoice);
          populateFromInvoice(res.invoice);
          setSuccessMsg(`Room charge rate adjusted for "${currentAdjustRoomTitle}". Folio balance updated.`);
          setAdjustingRoomItem(null);
          onSaved(activeInv.id, res.invoice, false);
        } else {
          setAdjustError(res.error || "Failed to adjust room charge.");
        }
      } else {
        // In-memory update
        const updated = [...items];
        updated[adjustingRoomItem.index] = {
          ...updated[adjustingRoomItem.index],
          rate: currentAdjustNewRate,
          quantity: currentAdjustNewQty,
          amount: currentAdjustNewTotal,
        };
        setItems(updated);
        setSuccessMsg(`Room charge rate adjusted to ₹${currentAdjustNewRate.toLocaleString('en-IN')}.`);
        setAdjustingRoomItem(null);
      }
    } catch (err: any) {
      setAdjustError(err.message || "Failed to adjust room charge.");
    } finally {
      setIsAdjustingRate(false);
    }
  };

  // Handler: Start Editing an Additional Service
  const handleStartEditCharge = (item: CreateInvoiceItemInput, index: number) => {
    setEditingChargeId(item.id || null);
    setEditingChargeIndex(index);
    setEditingDesc(item.description);
    setEditingCat(item.category || "custom");
    setEditingQty(Number(item.quantity) || 1);
    setEditingRate(String(item.rate || 0));
    setEditingStayPeriod(item.stay_period || "");
    setEditingIsComp(!!item.is_complimentary);
    setErrorMsg(null);
  };

  // Handler: Save Edited Additional Service
  const handleSaveEditCharge = async () => {
    if (editingChargeIndex === null) return;
    if (!editingDesc.trim()) {
      setErrorMsg("Description cannot be empty.");
      return;
    }
    const qtyNum = Number(editingQty);
    if (isNaN(qtyNum) || qtyNum < 1) {
      setErrorMsg("Quantity must be at least 1.");
      return;
    }
    const rateNum = editingIsComp ? 0 : Number(editingRate);
    if (isNaN(rateNum) || rateNum < 0) {
      setErrorMsg("Rate cannot be negative.");
      return;
    }

    const activeInv = currentFolio || existingInvoice;
    const itemId = editingChargeId;

    if (activeInv?.id && itemId && !itemId.startsWith("local-") && !itemId.startsWith("preview-item-")) {
      setIsUpdatingCharge(true);
      setErrorMsg(null);
      try {
        const res = await updateFolioChargeAction({
          invoiceId: activeInv.id,
          itemId,
          category: editingCat,
          description: editingDesc.trim(),
          quantity: qtyNum,
          rate: rateNum,
          stayPeriod: editingStayPeriod.trim() || null,
          isComplimentary: editingIsComp,
        });

        if (res.success && res.invoice) {
          setCurrentFolio(res.invoice);
          populateFromInvoice(res.invoice);
          setSuccessMsg(`Updated "${editingDesc.trim()}".`);
          setEditingChargeId(null);
          setEditingChargeIndex(null);
          onSaved(activeInv.id, res.invoice, false);
        } else {
          setErrorMsg(res.error || "Failed to update charge.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to update charge.");
      } finally {
        setIsUpdatingCharge(false);
      }
    } else {
      // In-memory update
      const updated = [...items];
      updated[editingChargeIndex] = {
        ...updated[editingChargeIndex],
        category: editingCat,
        description: editingDesc.trim(),
        quantity: qtyNum,
        rate: rateNum,
        amount: Number((qtyNum * rateNum).toFixed(2)),
        is_complimentary: editingIsComp,
        stay_period: editingStayPeriod.trim() || null
      };
      setItems(updated);
      setSuccessMsg(`Updated "${editingDesc.trim()}".`);
      setEditingChargeId(null);
      setEditingChargeIndex(null);
    }
  };

  // Handler: Delete Additional Service
  const handleDeleteCharge = async (itemId?: string, localIndex?: number) => {
    if (!confirm("Are you sure you want to remove this service charge from the folio?")) return;

    const activeInv = currentFolio || existingInvoice;
    if (activeInv?.id && itemId && !itemId.startsWith("local-") && !itemId.startsWith("preview-item-")) {
      setIsUpdatingCharge(true);
      setErrorMsg(null);
      try {
        const res = await removeFolioChargeAction({
          invoiceId: activeInv.id,
          itemId,
        });

        if (res.success && res.invoice) {
          setCurrentFolio(res.invoice);
          populateFromInvoice(res.invoice);
          setSuccessMsg("Service charge removed from folio.");
          onSaved(activeInv.id, res.invoice, false);
        } else {
          setErrorMsg(res.error || "Failed to remove charge.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to remove charge.");
      } finally {
        setIsUpdatingCharge(false);
      }
    } else if (localIndex !== undefined) {
      const updated = items.filter((_, idx) => idx !== localIndex);
      setItems(updated);
      setSuccessMsg("Service charge removed.");
    }
  };

  // Handler: Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeInv = currentFolio || existingInvoice;
    if (!activeInv?.id) {
      setPaymentError("A live folio must exist before recording payments.");
      return;
    }

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }

    if (amt > calculations.balanceDue) {
      setPaymentError(`Payment amount (₹${amt}) cannot exceed remaining balance (₹${calculations.balanceDue}).`);
      return;
    }

    setIsRecordingPayment(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      const idempotencyKey = `folio-pay-${activeInv.id}-${Date.now()}`;
      const res = await recordInvoicePaymentAction({
        invoiceId: activeInv.id,
        amount: amt,
        paymentMethod,
        paymentStage,
        transactionRef: paymentRef.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        idempotencyKey
      });

      if (res.success && res.invoice) {
        setCurrentFolio(res.invoice);
        populateFromInvoice(res.invoice);
        setPaymentSuccess(`Payment of ₹${amt.toLocaleString("en-IN")} recorded successfully in append-only ledger.`);
        setPaymentAmount("");
        setPaymentRef("");
        setPaymentNotes("");

        if (res.invoice.payments) {
          setLocalPayments(res.invoice.payments);
        }

        onSaved(activeInv.id, res.invoice, false);

        // Auto-open receipt modal immediately after recording payment
        const targetPaymentId = (res as any).paymentId || (res.invoice.payments && res.invoice.payments[res.invoice.payments.length - 1]?.id);
        if (targetPaymentId) {
          setIsLoadingReceipt(true);
          setReceiptModalOpen(true);
          getPaymentReceiptDataAction(targetPaymentId).then((rRes) => {
            setIsLoadingReceipt(false);
            if (rRes.success && rRes.receipt) {
              setSelectedReceipt(rRes.receipt);
            }
          });
        }
      } else {
        setPaymentError(res.error || "Failed to record payment transaction.");
      }
    } catch (err: any) {
      setPaymentError(err.message || "An unexpected error occurred while recording payment.");
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Handler: Open Receipt Modal for a Historical Payment
  const handleOpenReceipt = async (p: DbPayment) => {
    setIsLoadingReceipt(true);
    setReceiptModalOpen(true);
    try {
      const res = await getPaymentReceiptDataAction(p.id);
      if (res.success && res.receipt) {
        setSelectedReceipt(res.receipt);
      } else {
        const recNumber = p.receipt_number || formatReceiptNumber(p.created_at, p.id);
        const stage = p.payment_stage || extractPaymentStage(p);
        setSelectedReceipt({
          receiptNumber: recNumber,
          paymentId: p.id,
          stage,
          amount: p.amount,
          paymentMethod: p.payment_method,
          transactionRef: p.transaction_ref,
          notes: stripPaymentStageTag(p.notes),
          createdAt: p.created_at,
          formattedTimestamp: formatISTPaymentTimestamp(p.created_at),
          homestay: {
            id: currentHomestay?.id || currentFolio?.homestay_id || existingInvoice?.homestay_id || "",
            name: currentHomestay?.name || "Homestay",
            location: currentHomestay?.location || null,
            phone: currentHomestay?.phone || null,
            email: currentHomestay?.email || null,
          },
          guestName: currentFolio?.guest_name || existingInvoice?.guest_name || guestName || "Guest",
          guestPhone: currentFolio?.guest_phone || existingInvoice?.guest_phone || guestPhone || null,
          guestEmail: currentFolio?.guest_email || existingInvoice?.guest_email || guestEmail || null,
          roomName: currentFolio?.room_name || existingInvoice?.room_name || roomName || "Room",
          checkIn: currentFolio?.check_in || existingInvoice?.check_in || checkIn,
          checkOut: currentFolio?.check_out || existingInvoice?.check_out || checkOut,
          bookingId: currentFolio?.booking_id || existingInvoice?.booking_id || "",
          groupId: currentFolio?.group_id || existingInvoice?.group_id || null,
          totalContracted: calculations.grandTotal,
          grossCollected: calculations.amountPaid,
          balanceDue: calculations.balanceDue,
          paymentStatus: calculations.paymentStatus as any,
          cashierName: p.partners?.name || "Reception Desk",
          invoiceNumber: existingInvoice?.invoice_number || invoiceNumber,
        });
      }
    } catch (err) {
      console.error("Receipt loading exception:", err);
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  // Handler: Save Pending Folio Changes (Taxes, Discounts, Guest Details, Notes)
  // Preserves existing invoice status lifecycle without premature finalization.
  const handleSaveChanges = async () => {
    if (!activeInv?.id) {
      setErrorMsg("A live folio must exist before saving changes.");
      return;
    }

    setIsSavingChanges(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Retain existing structured internal audit logs and append user notes
      const rawNotes = activeInv.notes || "";
      const auditChunks = rawNotes
        .split("\n\n")
        .filter(chunk => chunk.trim().startsWith("["));

      const combinedNotes = [
        ...auditChunks,
        userNotes.trim()
      ].filter(Boolean).join("\n\n");

      const res = await updateInvoiceAction({
        id: activeInv.id,
        guestName: guestName.trim() || undefined,
        guestPhone: guestPhone.trim() || undefined,
        guestEmail: guestEmail.trim() || undefined,
        guestAddress: guestAddress.trim() || undefined,
        taxRate: taxRate,
        discountAmount: flatDiscount,
        notes: combinedNotes || undefined,
        houseRules: houseRules.trim() || undefined,
        status: activeInv.status, // Strictly preserves current status lifecycle
      });

      if (res.success && res.invoice) {
        setCurrentFolio(res.invoice);
        populateFromInvoice(res.invoice);
        setIsEditingGuestInfo(false);
        setSuccessMsg("Folio changes saved successfully.");
        onSaved(activeInv.id, res.invoice, false);
        setJustSaved(true);
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => {
          setJustSaved(false);
        }, 2000);
      } else {
        setErrorMsg(res.error || "Failed to save folio changes.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save folio changes.");
    } finally {
      setIsSavingChanges(false);
    }
  };

  // Handler: Finalize Tax Invoice at Checkout (Explicit Secondary Action)
  const handleFinalizeInvoice = async () => {
    if (!activeInv?.id) {
      setErrorMsg("A live folio must exist before finalizing a tax invoice.");
      return;
    }

    if (!confirm("Are you sure you want to issue the final tax invoice for this guest folio? This marks the billing as officially issued for check-out.")) {
      return;
    }

    setIsFinalizing(true);
    setErrorMsg(null);
    try {
      // First save pending modifications if any exist
      if (hasUnsavedChanges) {
        const rawNotes = activeInv.notes || "";
        const auditChunks = rawNotes
          .split("\n\n")
          .filter(chunk => chunk.trim().startsWith("["));
        const combinedNotes = [...auditChunks, userNotes.trim()].filter(Boolean).join("\n\n");

        await updateInvoiceAction({
          id: activeInv.id,
          guestName: guestName.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          guestEmail: guestEmail.trim() || undefined,
          guestAddress: guestAddress.trim() || undefined,
          taxRate: taxRate,
          discountAmount: flatDiscount,
          notes: combinedNotes || undefined,
          houseRules: houseRules.trim() || undefined,
          status: activeInv.status,
        });
      }

      const res = await finalizeFolioInvoiceAction(activeInv.id);
      if (res.success && res.invoice) {
        setCurrentFolio(res.invoice);
        populateFromInvoice(res.invoice);
        setSuccessMsg("Tax invoice successfully issued.");
        onSaved(activeInv.id, res.invoice, false);
      } else {
        setErrorMsg(res.error || "Failed to finalize tax invoice.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to finalize invoice.");
    } finally {
      setIsFinalizing(false);
    }
  };

  // Handler: Print Folio Document (Desktop & Browser Native)
  const handlePrint = () => {
    triggerBrowserPrint();
  };

  // Handler: Save Folio PDF directly to user's device storage (Mobile)
  const handleSaveFolioToDevice = async () => {
    const captureEl = document.getElementById("hms-pdf-capture-root");
    if (!captureEl) {
      setErrorMsg("Unable to locate folio layout for PDF generation.");
      return;
    }

    setIsDownloadingPdf(true);
    setErrorMsg(null);
    try {
      const filename = sanitizeInvoiceFilename(liveInvoice?.invoice_number || "folio");
      const blob = await generateElementPdfBlob(captureEl);
      downloadPdfBlob(blob, filename);
      setSuccessMsg("Folio PDF downloaded to your device.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Failed to generate and download PDF:", err);
      setErrorMsg(err?.message || "Failed to generate folio PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Handler: Share Folio PDF via native mobile share sheet
  const handleShareFolio = async () => {
    const captureEl = document.getElementById("hms-pdf-capture-root");
    if (!captureEl) {
      setErrorMsg("Unable to locate folio layout for PDF sharing.");
      return;
    }

    setIsSharingFolio(true);
    setErrorMsg(null);
    try {
      const filename = sanitizeInvoiceFilename(liveInvoice?.invoice_number || "folio");
      const blob = await generateElementPdfBlob(captureEl);
      const res = await sharePdfBlob(blob, filename, `Guest Folio - ${filename}`);
      if (res.downloadedFallback) {
        setSuccessMsg("Folio PDF saved to device (share sheet not supported).");
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      console.error("Failed to share folio PDF:", err);
      setErrorMsg(err?.message || "Failed to share folio PDF.");
    } finally {
      setIsSharingFolio(false);
    }
  };

  // Reactive Live Invoice Document object for Right Panel preview
  const liveInvoice: DbInvoice = useMemo(() => {
    const rawNotes = activeInv?.notes || notes || "";
    const auditChunks = rawNotes
      .split("\n\n")
      .filter(chunk => chunk.trim().startsWith("["));
    const combinedNotes = [
      ...auditChunks,
      userNotes.trim()
    ].filter(Boolean).join("\n\n");

    return {
      id: activeInv?.id || "preview-folio",
      homestay_id: activeInv?.homestay_id || currentHomestay?.id || "",
      booking_id: activeInv?.booking_id || booking?.id || "",
      group_id: activeInv?.group_id || booking?.group_id || null,
      invoice_number: invoiceNumber || "INV-PREVIEW",
      invoice_date: invoiceDate || new Date().toISOString().split("T")[0],
      status: activeInv?.status || calculations.paymentStatus as any,
      guest_name: guestName || "Guest",
      guest_phone: guestPhone || null,
      guest_email: guestEmail || null,
      guest_address: guestAddress || null,
      check_in: checkIn || new Date().toISOString().split("T")[0],
      check_out: checkOut || new Date().toISOString().split("T")[0],
      room_id: activeInv?.room_id || booking?.room_id || null,
      room_name: roomName || "Room",
      subtotal: calculations.subtotal,
      tax_rate: taxRate,
      tax_amount: calculations.taxAmount,
      discount_amount: calculations.discountAmount,
      grand_total: calculations.grandTotal,
      amount_paid: calculations.amountPaid,
      balance_due: calculations.balanceDue,
      notes: combinedNotes || null,
      house_rules: houseRules || null,
      created_by: activeInv?.created_by || null,
      created_at: activeInv?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items.map((it, idx) => ({
        id: it.id || `preview-item-${idx}`,
        invoice_id: activeInv?.id || "preview-folio",
        homestay_id: activeInv?.homestay_id || "",
        category: it.category || "custom",
        description: it.description,
        stay_period: it.stay_period || null,
        quantity: it.quantity,
        rate: it.rate,
        amount: it.amount !== undefined ? it.amount : Number(((it.quantity || 1) * (it.rate || 0)).toFixed(2)),
        sort_order: it.sort_order ?? idx,
        created_at: new Date().toISOString(),
      })),
      payments: localPayments,
    };
  }, [
    activeInv, currentHomestay, booking, invoiceNumber, invoiceDate,
    guestName, guestPhone, guestEmail, guestAddress, checkIn, checkOut, roomName,
    calculations, taxRate, notes, userNotes, houseRules, items, localPayments
  ]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#0F0E17]/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-in fade-in duration-200">
        <div className={cn(
          "bg-[#FAF9FF] border border-[#E8E6F2] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col w-[calc(100vw-16px)] sm:w-full h-[95dvh] max-h-[95dvh] sm:h-[94vh] sm:max-h-[94vh] overflow-hidden transition-all",
          showPreview ? "max-w-7xl 2xl:max-w-[1680px]" : "max-w-5xl"
        )}>
          
          {/* ============================================================== */}
          {/* DESKTOP TOP HEADER BAR (Unchanged for screens >= 640px)        */}
          {/* ============================================================== */}
          <div className="hidden sm:flex bg-white border-b border-[#E8E6F2] px-4 sm:px-6 py-3.5 sm:py-4 items-center justify-between gap-3 shrink-0">
            {/* Left: Back / Title / Status */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 sm:p-2 rounded-xl text-[#77758F] hover:text-[#24213A] hover:bg-[#F0EEFF] transition-colors cursor-pointer shrink-0"
                title="Close Folio"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-[#24213A] tracking-tight truncate">
                    Guest Folio & Billing
                  </h2>
                  
                  {/* Status Badge */}
                  <span className={cn(
                    "text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider",
                    calculations.balanceDue <= 0
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : calculations.amountPaid > 0
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      calculations.balanceDue <= 0 ? "bg-emerald-500" : calculations.amountPaid > 0 ? "bg-amber-500" : "bg-indigo-500"
                    )} />
                    {calculations.balanceDue <= 0 ? "Settled / Paid" : calculations.amountPaid > 0 ? "Partially Paid" : "Active Folio"}
                  </span>

                  {/* Group Booking Badge */}
                  {isGroupBooking && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-[#F0EEFF] text-[#5146D8] border border-[#E8E6F2]">
                      <Users className="w-3 h-3" />
                      Group Booking ({roomCharges.length} Rooms)
                    </span>
                  )}
                </div>

                <div className="text-xs text-[#77758F] flex items-center gap-2 mt-0.5 truncate">
                  <span className="font-semibold text-[#24213A]">{guestName || "Guest"}</span>
                  <span>•</span>
                  <span>Folio #{invoiceNumber || "DRAFT"}</span>
                  <span>•</span>
                  <span>{currentHomestay?.name || "Homestay"}</span>
                </div>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Secondary Document Preview Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowPreview(prev => {
                    const next = !prev;
                    if (!next) setIsPreviewMaximized(false);
                    return next;
                  });
                }}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer",
                  showPreview
                    ? "bg-[#F0EEFF] text-[#5146D8] border-[#5146D8]/30 shadow-xs"
                    : "bg-white text-[#77758F] border-[#E8E6F2] hover:text-[#24213A] hover:bg-[#F6F5FC]"
                )}
                title="Toggle Live Document Preview"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Preview Invoice</span>
              </button>

              {/* Print Folio */}
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1.5 bg-white border border-[#E8E6F2] hover:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Print Folio Document"
              >
                <Printer className="w-3.5 h-3.5 text-[#77758F]" />
                <span className="hidden sm:inline">Print</span>
              </button>

              {/* Issue Formal Tax Invoice (Explicit Secondary Action) */}
              {activeInv?.status !== "issued" && activeInv?.status !== "paid" && (
                <button
                  type="button"
                  onClick={handleFinalizeInvoice}
                  disabled={isFinalizing || isSavingChanges}
                  className="px-3 py-1.5 bg-white border border-[#E8E6F2] hover:bg-[#F6F5FC] hover:border-[#5146D8]/40 text-[#24213A] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Finalize and issue formal tax invoice for checkout"
                >
                  {isFinalizing ? (
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-[#5146D8]" />
                  )}
                  <span className="hidden md:inline">Issue Formal Tax Invoice</span>
                </button>
              )}

              {/* Save Changes (Primary Action) */}
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={!hasUnsavedChanges || isSavingChanges}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                  hasUnsavedChanges
                    ? "bg-[#5146D8] hover:bg-[#4338CA] text-white shadow-xs cursor-pointer"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                )}
                title={hasUnsavedChanges ? "Save all pending folio modifications" : "All modifications are saved"}
              >
                {isSavingChanges ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>All Changes Saved</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-[#77758F] hover:text-[#24213A] rounded-lg hover:bg-[#F0EEFF] transition-colors ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ============================================================== */}
          {/* MOBILE TOP HEADER BAR (Mobile Only: dedicated non-overlap UI)   */}
          {/* ============================================================== */}
          <div className="sm:hidden bg-white border-b border-[#E8E6F2] px-3.5 py-2.5 space-y-2 shrink-0">
            {/* Row 1: Back + Title + Action Icons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 -ml-1 rounded-xl text-[#77758F] active:bg-[#F0EEFF] active:text-[#24213A] transition-colors cursor-pointer shrink-0"
                  title="Close Folio"
                  aria-label="Close Folio"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-sm font-bold text-[#24213A] tracking-tight truncate">
                  Guest Folio & Billing
                </h2>
              </div>

              {/* Action Icons Row */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Preview Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPreview(prev => {
                      const next = !prev;
                      if (next) setIsPreviewMaximized(true);
                      else setIsPreviewMaximized(false);
                      return next;
                    });
                  }}
                  className={cn(
                    "w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer",
                    showPreview
                      ? "bg-[#F0EEFF] text-[#5146D8] border-[#5146D8]/40 shadow-xs"
                      : "bg-white text-[#77758F] border-[#E8E6F2] active:bg-[#F6F5FC]"
                  )}
                  title="Live Document Preview"
                  aria-label="Live Document Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>

                {/* Print Folio */}
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-8 h-8 rounded-lg bg-white border border-[#E8E6F2] active:bg-[#F6F5FC] text-[#77758F] flex items-center justify-center transition-colors cursor-pointer"
                  title="Print Folio Document"
                  aria-label="Print Folio Document"
                >
                  <Printer className="w-4 h-4" />
                </button>

                {/* Issue Tax Invoice (Document Icon) */}
                {activeInv?.status !== "issued" && activeInv?.status !== "paid" && (
                  <button
                    type="button"
                    onClick={handleFinalizeInvoice}
                    disabled={isFinalizing || isSavingChanges}
                    className="w-8 h-8 rounded-lg bg-white border border-[#E8E6F2] active:bg-[#F6F5FC] text-[#5146D8] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                    title="Issue Formal Tax Invoice"
                    aria-label="Issue Formal Tax Invoice"
                  >
                    {isFinalizing ? (
                      <Clock className="w-4 h-4 animate-spin text-[#5146D8]" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </button>
                )}

                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg text-[#77758F] active:bg-[#F0EEFF] active:text-[#24213A] flex items-center justify-center transition-colors cursor-pointer"
                  title="Close Modal"
                  aria-label="Close Modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Row 2: Payment Status Badge & Compact Save Status Indicator */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F0EEFF]">
              {/* Payment Status Badge */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider shrink-0",
                  calculations.balanceDue <= 0
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : calculations.amountPaid > 0
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    calculations.balanceDue <= 0 ? "bg-emerald-500" : calculations.amountPaid > 0 ? "bg-amber-500" : "bg-indigo-500"
                  )} />
                  {calculations.balanceDue <= 0 ? "Settled / Paid" : calculations.amountPaid > 0 ? "Partially Paid" : "Active Folio"}
                </span>

                {isGroupBooking && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 bg-[#F0EEFF] text-[#5146D8] border border-[#E8E6F2] shrink-0">
                    <Users className="w-2.5 h-2.5" />
                    {roomCharges.length} Rooms
                  </span>
                )}
              </div>

              {/* Compact "All Changes Saved" / "Save" Indicator */}
              <div className="shrink-0">
                {isSavingChanges ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5146D8] bg-[#F0EEFF] px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3 animate-spin" />
                    <span>Saving...</span>
                  </span>
                ) : justSaved ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full animate-in fade-in">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Saved</span>
                  </span>
                ) : hasUnsavedChanges ? (
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#5146D8] text-white px-2.5 py-0.5 rounded-lg active:bg-[#4338CA] shadow-2xs cursor-pointer"
                  >
                    <Save className="w-3 h-3" />
                    <span>Save</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>All Changes Saved</span>
                  </span>
                )}
              </div>
            </div>

            {/* Row 3: Booking Information Pill in Separate Compact Position */}
            <div className="pt-0.5">
              <div className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-lg px-2.5 py-1 text-[11px] text-[#77758F] flex items-center gap-1.5 w-full overflow-hidden">
                <span className="font-semibold text-[#24213A] truncate">{guestName || "Guest"}</span>
                <span className="text-[#77758F]/50">•</span>
                <span className="font-mono text-[10px] text-[#5146D8] font-bold shrink-0">#{invoiceNumber || "DRAFT"}</span>
                <span className="text-[#77758F]/50">•</span>
                <span className="truncate">{currentHomestay?.name || "Homestay"}</span>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* BODY: SPLIT VIEW OR FULL VIEW                                 */}
          {/* ============================================================== */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            
            {/* MAIN GUEST FOLIO PANEL */}
            <div className={cn(
              "flex-1 overflow-y-auto overflow-x-hidden hms-editor-scrollbar overscroll-contain p-3.5 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 transition-all min-h-0 pb-28 sm:pb-8",
              isPreviewMaximized ? "hidden" : showPreview ? "hidden lg:block lg:w-1/2 xl:w-[50%]" : "max-w-5xl mx-auto w-full"
            )}>

              {/* Error & Success Alerts */}
              {errorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1">
                    <span className="font-semibold text-rose-800 block">Notice</span>
                    <span>{errorMsg}</span>
                  </div>
                  <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="flex-1 font-medium">{successMsg}</span>
                  <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* ========================================================== */}
              {/* SECTION A: GUEST & BOOKING DETAILS (Compact Card)           */}
              {/* ========================================================== */}
              <div className="bg-white border border-[#E8E6F2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#F0EEFF] pb-2.5">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#5146D8]" />
                    <span className="text-xs font-bold text-[#24213A] uppercase tracking-wider">
                      Guest & Stay Information
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingGuestInfo(prev => !prev)}
                      className="text-xs text-[#5146D8] hover:text-[#4338CA] px-2 py-1 rounded-lg hover:bg-[#F0EEFF] transition-colors flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>{isEditingGuestInfo ? "Close Details" : "Edit Details"}</span>
                    </button>
                    <span className="text-[11px] font-medium text-[#77758F] hidden sm:inline">
                      • {currentHomestay?.name || "Homestay"}
                    </span>
                  </div>
                </div>

                {isEditingGuestInfo ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-[#FAF9FF] p-3 rounded-xl border border-[#E8E6F2] animate-in fade-in duration-150">
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-[#77758F] block mb-1">Guest Name *</label>
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A] focus:outline-none focus:border-[#5146D8]"
                        placeholder="Guest Name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-[#77758F] block mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A] focus:outline-none focus:border-[#5146D8]"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-[#77758F] block mb-1">Email Address</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A] focus:outline-none focus:border-[#5146D8]"
                        placeholder="guest@example.com"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-[#77758F] block mb-1">Billing Address / City</label>
                      <input
                        type="text"
                        value={guestAddress}
                        onChange={(e) => setGuestAddress(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A] focus:outline-none focus:border-[#5146D8]"
                        placeholder="City, State"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 text-xs">
                    {/* Guest Name & Phone */}
                    <div className="bg-[#FAF9FF] p-2.5 rounded-xl border border-[#F0EEFF]">
                      <span className="text-[10px] uppercase font-semibold text-[#77758F] block">Primary Guest</span>
                      <span className="font-bold text-[#24213A] text-sm block truncate">{guestName || "Guest"}</span>
                      {guestPhone ? (
                        <a href={`tel:${guestPhone}`} className="text-[#5146D8] hover:underline flex items-center gap-1 mt-0.5 font-mono text-[11px]">
                          <Phone className="w-3 h-3" />
                          {guestPhone}
                        </a>
                      ) : (
                        <span className="text-[11px] text-[#77758F] mt-0.5 block italic">No phone added</span>
                      )}
                      {guestEmail && (
                        <a href={`mailto:${guestEmail}`} className="text-[#77758F] hover:text-[#5146D8] flex items-center gap-1 mt-0.5 text-[11px] truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{guestEmail}</span>
                        </a>
                      )}
                    </div>

                    {/* Stay Dates */}
                    <div className="bg-[#FAF9FF] p-2.5 rounded-xl border border-[#F0EEFF]">
                      <span className="text-[10px] uppercase font-semibold text-[#77758F] block">Stay Period</span>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Calendar className="w-3.5 h-3.5 text-[#5146D8] shrink-0" />
                        <span className="font-semibold text-[#24213A] text-xs">
                          {checkIn ? formatISTCompactDate(checkIn) : "Check-in"} → {checkOut ? formatISTCompactDate(checkOut) : "Check-out"}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#77758F] block mt-0.5">
                        Duration: <strong className="text-[#5146D8]">{numberOfNights} Night{numberOfNights > 1 ? "s" : ""}</strong>
                      </span>
                    </div>

                    {/* Booked Room(s) */}
                    <div className="bg-[#FAF9FF] p-2.5 rounded-xl border border-[#F0EEFF]">
                      <span className="text-[10px] uppercase font-semibold text-[#77758F] block">Booked Accommodation</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <BedDouble className="w-3.5 h-3.5 text-[#5146D8] shrink-0" />
                        <span className="font-semibold text-[#24213A] truncate" title={roomName}>
                          {roomName || "Room"}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#77758F] block mt-0.5">
                        {roomCharges.length} Room Line Item{roomCharges.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Folio Metadata */}
                    <div className="bg-[#FAF9FF] p-2.5 rounded-xl border border-[#F0EEFF]">
                      <span className="text-[10px] uppercase font-semibold text-[#77758F] block">Folio Reference</span>
                      <span className="font-mono font-bold text-[#24213A] block truncate">{invoiceNumber || "DRAFT"}</span>
                      <span className="text-[11px] text-[#77758F] block mt-0.5">
                        Date: {invoiceDate ? formatISTCompactDate(invoiceDate) : "Today"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ========================================================== */}
              {/* SECTION B: ROOM CHARGES (Editable by Authorized Staff)    */}
              {/* ========================================================== */}
              <div className="bg-white border border-[#E8E6F2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0EEFF] pb-3">
                  <div className="flex items-center gap-2">
                    <BedDouble className="w-4 h-4 text-[#5146D8]" />
                    <h3 className="text-sm font-bold text-[#24213A]">
                      Room Charges ({roomCharges.length})
                    </h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FAF9FF] border border-[#E8E6F2] text-[#77758F]">
                      Contractual Rate
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <span className="text-xs text-[#77758F]">Room Subtotal:</span>
                    <span className="font-mono font-bold text-[#5146D8] text-sm">
                      ₹{roomChargesSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Room Charges List */}
                <div className="space-y-2.5">
                  {roomCharges.map(({ item, index }) => {
                    const itemRate = Number(item.rate) || 0;
                    const itemQty = Number(item.quantity) || 1;
                    const itemAmount = Number(item.amount) || (itemRate * itemQty);

                    return (
                      <div
                        key={item.id || `room-${index}`}
                        className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#5146D8]/30 transition-all"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[#F0EEFF] text-[#5146D8] flex items-center justify-center shrink-0 mt-0.5">
                            <BedDouble className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-[#24213A] block truncate">
                              {item.description}
                            </span>
                            <div className="text-[11px] text-[#77758F] flex items-center gap-2 mt-0.5 flex-wrap">
                              <span>₹{itemRate.toLocaleString("en-IN")} / night</span>
                              <span>×</span>
                              <span>{itemQty} night{itemQty > 1 ? "s" : ""}</span>
                              {item.stay_period && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-[10px] text-[#5146D8]">{item.stay_period}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Amount & Adjust Rate Button */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E8E6F2]/60">
                          <span className="font-mono font-bold text-sm text-[#24213A]">
                            ₹{itemAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleOpenRoomAdjustment(item, index)}
                            className="px-2.5 py-1.5 bg-white border border-[#E8E6F2] hover:border-[#5146D8] hover:text-[#5146D8] text-[#24213A] rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Adjust rate with authorized audit trail"
                          >
                            <Pencil className="w-3 h-3 text-[#5146D8]" />
                            <span>Adjust Rate</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-[#77758F] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#5146D8] shrink-0" />
                  <span>Authorized room rate adjustments will be recorded in the folio audit trail. Original booking contract remains preserved.</span>
                </p>
              </div>

              {/* ========================================================== */}
              {/* SECTION C: ADDITIONAL SERVICES (Editable & Removable)      */}
              {/* ========================================================== */}
              <div className="bg-white border border-[#E8E6F2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0EEFF] pb-3">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-[#5146D8]" />
                    <h3 className="text-sm font-bold text-[#24213A]">
                      Additional Services ({additionalCharges.length})
                    </h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FAF9FF] border border-[#E8E6F2] text-[#77758F]">
                      In-Stay Charges & Extras
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <span className="text-xs text-[#77758F]">Services Subtotal:</span>
                    <span className="font-mono font-bold text-[#5146D8] text-sm">
                      ₹{additionalChargesSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Quick Add Form */}
                <form onSubmit={handleAddFolioCharge} className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-3.5 space-y-3">
                  <span className="text-xs font-bold text-[#24213A] flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-[#5146D8]" />
                    Quick Add Additional Service
                  </span>

                  {/* Suggestion Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                    {DEFAULT_SUGGESTED_ITEMS.map((sug) => (
                      <button
                        key={sug.name}
                        type="button"
                        onClick={() => {
                          setNewChargeCat(sug.cat);
                          setNewChargeDesc(sug.name);
                          setNewChargeRate(String(sug.rate));
                          setNewChargeQty(1);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-[#E8E6F2] hover:border-[#5146D8] text-[#77758F] hover:text-[#5146D8] whitespace-nowrap text-[11px] transition-colors shrink-0 cursor-pointer shadow-2xs"
                      >
                        + {sug.name} (₹{sug.rate})
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5">
                    {/* Category Selector */}
                    <div className="col-span-2 sm:col-span-3">
                      <select
                        value={newChargeCat}
                        onChange={(e) => setNewChargeCat(e.target.value as InvoiceItemCategory)}
                        className="w-full h-9 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                      >
                        {ADDITIONAL_SERVICE_CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Description */}
                    <div className="col-span-2 sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Service description (e.g. Dinner, Laundry)"
                        value={newChargeDesc}
                        onChange={(e) => setNewChargeDesc(e.target.value)}
                        className="w-full h-9 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                      />
                    </div>

                    {/* Qty */}
                    <div className="col-span-1 sm:col-span-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={newChargeQty}
                        onChange={(e) => setNewChargeQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full h-9 px-2 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                      />
                    </div>

                    {/* Rate */}
                    <div className="col-span-1 sm:col-span-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#77758F]">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Price"
                          value={newChargeRate}
                          onChange={(e) => setNewChargeRate(e.target.value)}
                          className="w-full h-9 pl-6 pr-2 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                        />
                      </div>
                    </div>

                    {/* Add Button */}
                    <div className="col-span-2 sm:col-span-1">
                      <button
                        type="submit"
                        disabled={isAddingCharge}
                        className="w-full h-9 bg-[#5146D8] hover:bg-[#4338CA] text-white rounded-lg text-xs font-semibold flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-xs gap-1"
                        title="Add service charge to folio"
                      >
                        {isAddingCharge ? (
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span className="sm:hidden font-medium">Add Charge</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>

                {/* Additional Charges List */}
                <div className="space-y-2">
                  {additionalCharges.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-[#E8E6F2] rounded-xl">
                      <Utensils className="w-6 h-6 text-[#77758F]/40 mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-[#77758F]">No additional services added yet</p>
                      <p className="text-[11px] text-[#77758F]/70">Use the quick add form above to charge food, laundry, taxi, or extra beds</p>
                    </div>
                  ) : (
                    additionalCharges.map(({ item, index }) => {
                      const isEditing = editingChargeIndex === index;
                      const itemRate = Number(item.rate) || 0;
                      const itemQty = Number(item.quantity) || 1;
                      const itemAmount = Number(item.amount) || (itemRate * itemQty);

                      if (isEditing) {
                        return (
                          <div key={item.id || `edit-svc-${index}`} className="bg-[#FAF9FF] border-2 border-[#5146D8] rounded-xl p-3 space-y-2.5">
                            <div className="flex items-center justify-between text-xs font-bold text-[#5146D8]">
                              <span>Edit Service Charge</span>
                              <button onClick={() => setEditingChargeIndex(null)} className="text-[#77758F] hover:text-[#24213A]">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                              <input
                                type="text"
                                value={editingDesc}
                                onChange={(e) => setEditingDesc(e.target.value)}
                                className="col-span-2 sm:col-span-5 h-8 px-2 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A]"
                                placeholder="Description"
                              />
                              <input
                                type="number"
                                min="1"
                                value={editingQty}
                                onChange={(e) => setEditingQty(Math.max(1, parseInt(e.target.value) || 1))}
                                className="col-span-1 sm:col-span-2 h-8 px-2 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A]"
                                placeholder="Qty"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingRate}
                                onChange={(e) => setEditingRate(e.target.value)}
                                className="col-span-1 sm:col-span-3 h-8 px-2 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A]"
                                placeholder="Price (₹)"
                              />
                              <div className="col-span-2 sm:col-span-2 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={handleSaveEditCharge}
                                  disabled={isUpdatingCharge}
                                  className="flex-1 h-8 bg-[#5146D8] text-white text-xs font-semibold rounded-lg flex items-center justify-center cursor-pointer"
                                >
                                  {isUpdatingCharge ? <Clock className="w-3 h-3 animate-spin" /> : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingChargeIndex(null)}
                                  className="h-8 px-2 bg-white border border-[#E8E6F2] text-[#77758F] text-xs rounded-lg cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id || `svc-${index}`}
                          className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:border-[#5146D8]/30 transition-all text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-white border border-[#E8E6F2] text-[#77758F] shrink-0">
                              {item.category || "custom"}
                            </span>
                            <span className="font-semibold text-[#24213A] truncate flex-1 min-w-0">
                              {item.description}
                            </span>
                            <span className="text-[11px] text-[#77758F] shrink-0">
                              ({itemQty} × ₹{itemRate.toLocaleString("en-IN")})
                            </span>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-[#E8E6F2]/50">
                            <span className="font-mono font-bold text-[#24213A]">
                              ₹{itemAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEditCharge(item, index)}
                                className="p-1.5 text-[#77758F] hover:text-[#5146D8] rounded-md hover:bg-white transition-colors cursor-pointer"
                                title="Edit service charge"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteCharge(item.id, index)}
                                className="p-1.5 text-[#77758F] hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Remove service charge"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Optional Taxes & Discount Controls Toggle */}
                <div className="pt-2 border-t border-[#F0EEFF]">
                  <button
                    type="button"
                    onClick={() => setShowTaxDiscountPanel(prev => !prev)}
                    className="text-xs text-[#77758F] hover:text-[#5146D8] flex items-center gap-1.5 font-medium cursor-pointer"
                  >
                    {showTaxDiscountPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{showTaxDiscountPanel ? "Hide Tax & Discount Adjustments" : "Adjust Taxes & Discounts"}</span>
                    {(taxRate > 0 || flatDiscount > 0) && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-[#F0EEFF] text-[#5146D8] rounded-full">
                        Active
                      </span>
                    )}
                  </button>

                  {showTaxDiscountPanel && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-[#FAF9FF] rounded-xl border border-[#E8E6F2] text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-[#77758F] block mb-1">
                          GST / Tax Rate (%)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={taxRate}
                            onChange={(e) => setTaxRate(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full h-8 pl-2 pr-6 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A]"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#77758F]">%</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#77758F] block mb-1">
                          Flat Discount (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#77758F]">₹</span>
                          <input
                            type="number"
                            min="0"
                            value={flatDiscount}
                            onChange={(e) => setFlatDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full h-8 pl-6 pr-2 text-xs bg-white border border-[#E8E6F2] rounded-lg text-[#24213A]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ========================================================== */}
              {/* SECTION D: PAYMENT SUMMARY & PAYMENT HISTORY               */}
              {/* ========================================================== */}
              <div className="bg-white border border-[#E8E6F2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-[#F0EEFF] pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#5146D8]" />
                    <h3 className="text-sm font-bold text-[#24213A]">
                      Payment Summary & Ledger
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-[#77758F]">
                    {localPayments.length} Transaction{localPayments.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* 1. Top KPI Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Total Charges */}
                  <div className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-3.5">
                    <span className="text-[11px] uppercase font-semibold text-[#77758F] block">
                      Total Charges
                    </span>
                    <span className="font-mono text-lg font-black text-[#24213A] mt-0.5 block">
                      ₹{calculations.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-[#77758F] block mt-0.5">
                      Subtotal: ₹{calculations.subtotal} • Tax: ₹{calculations.taxAmount}
                    </span>
                  </div>

                  {/* Total Payments Received */}
                  <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5">
                    <span className="text-[11px] uppercase font-semibold text-emerald-800 block">
                      Total Paid
                    </span>
                    <span className="font-mono text-lg font-black text-emerald-700 mt-0.5 block">
                      ₹{calculations.amountPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-emerald-600 block mt-0.5">
                      Collected across {localPayments.length} payment{localPayments.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Remaining Balance Due */}
                  <div className={cn(
                    "rounded-xl p-3.5 border",
                    calculations.balanceDue <= 0
                      ? "bg-emerald-50/60 border-emerald-200 text-emerald-800"
                      : "bg-amber-50/60 border-amber-200 text-amber-900"
                  )}>
                    <span className="text-[11px] uppercase font-semibold block">
                      Remaining Balance Due
                    </span>
                    <span className={cn(
                      "font-mono text-lg font-black mt-0.5 block",
                      calculations.balanceDue <= 0 ? "text-emerald-700" : "text-amber-800"
                    )}>
                      ₹{calculations.balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] block mt-0.5">
                      {calculations.balanceDue <= 0 ? "Fully settled • ₹0.00 due" : "Outstanding balance to collect"}
                    </span>
                  </div>
                </div>

                {/* 2. Direct Payment Recording Form */}
                <div className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-4 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#24213A] flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#5146D8]" />
                      Record Payment Transaction
                    </span>

                    {/* Quick 1-Click Balance Chips */}
                    {calculations.balanceDue > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleSetFullBalance}
                          className="px-2.5 py-1 bg-[#5146D8] hover:bg-[#4338CA] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                        >
                          ⚡ Pay Full Balance (₹{calculations.balanceDue.toFixed(2)})
                        </button>
                        {calculations.balanceDue >= 1000 && (
                          <button
                            type="button"
                            onClick={() => handleSetPresetAmount(1000)}
                            className="px-2 py-1 bg-white border border-[#E8E6F2] hover:border-[#5146D8] text-[#77758F] hover:text-[#5146D8] rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            ₹1,000
                          </button>
                        )}
                        {calculations.balanceDue >= 2000 && (
                          <button
                            type="button"
                            onClick={() => handleSetPresetAmount(2000)}
                            className="px-2 py-1 bg-white border border-[#E8E6F2] hover:border-[#5146D8] text-[#77758F] hover:text-[#5146D8] rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            ₹2,000
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {paymentError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{paymentError}</span>
                    </div>
                  )}

                  {paymentSuccess && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{paymentSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleRecordPayment} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                      {/* Amount */}
                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-semibold text-[#77758F] block mb-1">
                          Amount (₹) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#77758F]">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={calculations.balanceDue > 0 ? calculations.balanceDue : undefined}
                            placeholder="0.00"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="w-full h-9 pl-6 pr-2 text-xs font-mono font-bold bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                            required
                          />
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-semibold text-[#77758F] block mb-1">
                          Payment Method *
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full h-9 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                        >
                          <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                          <option value="cash">Cash</option>
                          <option value="card">Debit / Credit Card</option>
                          <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                        </select>
                      </div>

                      {/* Payment Stage */}
                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-semibold text-[#77758F] block mb-1">
                          Payment Stage
                        </label>
                        <select
                          value={paymentStage}
                          onChange={(e) => setPaymentStage(e.target.value as PaymentStage)}
                          className="w-full h-9 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                        >
                          <option value="advance">Pre-Arrival Advance</option>
                          <option value="partial">During Stay Payment</option>
                          <option value="final">Checkout Settlement</option>
                        </select>
                      </div>

                      {/* Transaction Reference */}
                      <div className="sm:col-span-3">
                        <label className="text-[11px] font-semibold text-[#77758F] block mb-1">
                          Reference / UTR (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Txn ID / UTR / Cash receipt"
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                          className="w-full h-9 px-2.5 text-xs bg-white border border-[#E8E6F2] rounded-lg focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                      <span className="text-[11px] text-[#77758F]">
                        An official printable receipt will be generated automatically upon recording.
                      </span>

                      <button
                        type="submit"
                        disabled={isRecordingPayment || !paymentAmount}
                        className="w-full sm:w-auto px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isRecordingPayment ? (
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Receipt className="w-3.5 h-3.5" />
                        )}
                        <span>Record Payment & Issue Receipt</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* 3. Payment Ledger History */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[#24213A] block">
                    Payment Ledger History
                  </span>

                  {localPayments.length === 0 ? (
                    <div className="text-center py-5 border border-dashed border-[#E8E6F2] rounded-xl text-xs text-[#77758F]">
                      No payments recorded on this folio yet. Record an advance or during-stay payment above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {localPayments.map((p) => {
                        const recNum = p.receipt_number || formatReceiptNumber(p.created_at, p.id);
                        const stageInfo = getStageBadgeDetails(p.payment_stage || extractPaymentStage(p));

                        return (
                          <div
                            key={p.id}
                            className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                          >
                            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                              <span className="font-mono font-bold text-[#5146D8] shrink-0">
                                {recNum}
                              </span>

                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0",
                                stageInfo.badgeClass
                              )}>
                                {stageInfo.label}
                              </span>

                              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 bg-white border border-[#E8E6F2] text-[#77758F] rounded shrink-0">
                                {p.payment_method}
                              </span>

                              <span className="text-[#77758F] text-[11px] shrink-0">
                                {p.created_at ? formatISTPaymentTimestamp(p.created_at) : "Recorded"}
                              </span>

                              {p.transaction_ref && (
                                <span className="font-mono text-[10px] text-[#77758F] truncate">
                                  Ref: {p.transaction_ref}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E8E6F2]/60">
                              <span className="font-mono font-bold text-sm text-[#059669]">
                                +₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleOpenReceipt(p)}
                                className="px-2.5 py-1 bg-white border border-[#E8E6F2] hover:border-[#5146D8] text-[#5146D8] rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                title="View official payment receipt"
                              >
                                <Receipt className="w-3 h-3" />
                                <span>Receipt</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ========================================================== */}
              {/* SECTION E: FINAL ACTIONS & AUDIT TRAIL                     */}
              {/* ========================================================== */}
              <div className="bg-white border border-[#E8E6F2] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#F0EEFF] pb-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[#5146D8]" />
                    <h3 className="text-sm font-bold text-[#24213A]">
                      Folio Audit History & Notes
                    </h3>
                  </div>
                  <span className="text-xs text-[#77758F]">
                    {auditEntries.length} Rate Adjustment{auditEntries.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Audit Entries Timeline */}
                {auditEntries.length > 0 ? (
                  <div className="space-y-2.5">
                    {auditEntries.map((log) => (
                      <div
                        key={log.id}
                        className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-[#5146D8] flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-[#5146D8]" />
                            {log.title}
                          </span>
                          <span className="text-[11px] text-[#77758F] font-mono">
                            {log.timestamp} • By {log.actor}
                          </span>
                        </div>
                        <p className="text-[#24213A]">{log.details}</p>
                        {log.reason && (
                          <span className="inline-block px-2 py-0.5 bg-[#F0EEFF] text-[#5146D8] rounded text-[10px] font-medium">
                            Reason: {log.reason}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 border border-dashed border-[#E8E6F2] rounded-xl text-xs text-[#77758F]">
                    No rate adjustments recorded on this folio. All room charges reflect initial contractual booking rates.
                  </div>
                )}

                {/* General Guest / Folio Notes (Editable) */}
                <div className="p-3.5 bg-[#FAF9FF] border border-[#E8E6F2] rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-[#24213A] text-xs flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#5146D8]" />
                      <span>Folio Remarks & Guest Notes</span>
                    </label>
                    <span className="text-[11px] text-[#77758F]">
                      Editable • Saved on &quot;Save Changes&quot;
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Enter internal or guest-facing notes, special requests, or checkout remarks..."
                    className="w-full p-2.5 bg-white border border-[#E8E6F2] rounded-lg text-xs text-[#24213A] focus:outline-none focus:border-[#5146D8] resize-y"
                  />
                </div>

                {/* Footer Action Buttons */}
                <div className="hidden sm:flex items-center justify-between pt-2 border-t border-[#F0EEFF]">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-white border border-[#E8E6F2] hover:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Close
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-4 py-2 bg-white border border-[#E8E6F2] hover:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#77758F]" />
                      <span>Print Folio</span>
                    </button>

                    {activeInv?.status !== "issued" && activeInv?.status !== "paid" && (
                      <button
                        type="button"
                        onClick={handleFinalizeInvoice}
                        disabled={isFinalizing || isSavingChanges}
                        className="px-4 py-2 bg-white border border-[#E8E6F2] hover:bg-[#F6F5FC] hover:border-[#5146D8]/40 text-[#24213A] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isFinalizing ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-[#5146D8]" />}
                        <span>Issue Formal Tax Invoice</span>
                      </button>
                    )}

                    {/* Primary Save Changes Button */}
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      disabled={!hasUnsavedChanges || isSavingChanges}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                        hasUnsavedChanges
                          ? "bg-[#5146D8] hover:bg-[#4338CA] text-white shadow-xs cursor-pointer"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                      )}
                    >
                      {isSavingChanges ? (
                        <>
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : hasUnsavedChanges ? (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>All Changes Saved</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* ============================================================== */}
            {/* RIGHT PANEL: SECONDARY LIVE INVOICE PREVIEW                    */}
            {/* ============================================================== */}
            {showPreview && (
              <div className={cn(
                "bg-[#F6F5FC] border-l border-[#E8E6F2] min-h-0 transition-all flex flex-col",
                isPreviewMaximized ? "w-full" : "w-full lg:w-1/2 xl:w-[50%]"
              )}>
                {/* Fixed Preview Toolbar (Pinned at top, does NOT scroll away) */}
                <div className="shrink-0 bg-white border-b border-[#E8E6F2] px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-2 shadow-2xs z-10">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setShowPreview(false)}
                      className="p-1 -ml-1 rounded-lg text-[#77758F] hover:text-[#24213A] hover:bg-[#F0EEFF] lg:hidden cursor-pointer shrink-0"
                      title="Back to Folio"
                      aria-label="Back to Folio"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-xs font-bold text-[#24213A] truncate">Live Invoice Preview</span>
                    <span className="text-[11px] text-[#77758F] hidden sm:inline shrink-0">• Standard A4</span>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {/* Fullscreen / Split View toggle (Desktop only) */}
                    <button
                      type="button"
                      onClick={() => setIsPreviewMaximized(prev => !prev)}
                      className="hidden lg:flex text-xs text-[#5146D8] hover:text-[#4338CA] bg-[#F0EEFF] hover:bg-[#E5E3FA] px-2.5 py-1.5 rounded-xl items-center gap-1.5 font-semibold transition-colors cursor-pointer"
                      title={isPreviewMaximized ? "Return to Split Screen View" : "Maximize Preview to Fullscreen"}
                    >
                      {isPreviewMaximized ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>Split View</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Maximize Preview</span>
                        </>
                      )}
                    </button>

                    {/* Print Folio */}
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="text-xs text-[#24213A] hover:text-[#5146D8] bg-white border border-[#E8E6F2] hover:bg-[#FAF9FF] px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold transition-colors cursor-pointer shadow-2xs"
                      title="Print Document"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#5146D8]" />
                      <span>Print</span>
                    </button>

                    {/* Close Preview on Mobile */}
                    <button
                      type="button"
                      onClick={() => setShowPreview(false)}
                      className="p-1 rounded-lg text-[#77758F] hover:text-[#24213A] hover:bg-[#F0EEFF] lg:hidden cursor-pointer"
                      title="Close Preview"
                      aria-label="Close Preview"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Independent Scrolling Viewport */}
                <div className="flex-1 min-h-0 overflow-y-auto hms-editor-scrollbar overscroll-contain p-4 sm:p-6 lg:p-8 flex flex-col items-center">
                  <div className="w-full max-w-[850px] shadow-lg rounded-xl overflow-hidden border border-[#E8E6F2] bg-white mb-12 shrink-0 transition-all">
                    <InvoicePDFView
                      invoice={liveInvoice}
                      homestay={currentHomestay}
                    />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* ============================================================== */}
          {/* MOBILE STICKY BOTTOM ACTION BAR (Below 768px / sm)             */}
          {/* ============================================================== */}
          <div className="sm:hidden bg-white/95 backdrop-blur-md border-t border-[#E8E6F2] p-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(36,33,58,0.08)] shrink-0 z-20 space-y-2">
            {/* Row 1: Close & Share Folio */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 bg-white border border-[#E8E6F2] active:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <X className="w-3.5 h-3.5 text-[#77758F]" />
                <span>Close</span>
              </button>

              <button
                type="button"
                onClick={handleShareFolio}
                disabled={isSharingFolio || isDownloadingPdf}
                className="h-9 px-3 bg-white border border-[#E8E6F2] active:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60 transition-colors"
                title="Share complete Folio PDF via native share sheet"
              >
                {isSharingFolio ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin text-[#5146D8]" />
                    <span>Preparing...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-[#5146D8]" />
                    <span>Share Folio</span>
                  </>
                )}
              </button>
            </div>

            {/* Row 2: Save Folio to Device (Full Width) */}
            <button
              type="button"
              onClick={handleSaveFolioToDevice}
              disabled={isDownloadingPdf || isSharingFolio}
              className="w-full h-9.5 px-4 bg-white border border-[#D5D2E8] active:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-60 transition-colors"
              title="Download complete Folio PDF directly to device storage"
            >
              {isDownloadingPdf ? (
                <>
                  <Clock className="w-4 h-4 animate-spin text-[#5146D8]" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#5146D8]" />
                  <span>Save Folio to Device</span>
                </>
              )}
            </button>

            {/* Row 3: Save Changes (Full Width, Primary Indigo) */}
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={isSavingChanges}
              className={cn(
                "w-full h-10 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs",
                justSaved
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-[#5146D8] active:bg-[#4338CA] text-white"
              )}
              title="Save all pending folio modifications to database"
            >
              {isSavingChanges ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : justSaved ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in-75 duration-150" />
                  <span className="font-bold">Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* ================================================================== */}
      {/* ROOM RATE ADJUSTMENT MODAL (Authorized Staff with Audit Trail)      */}
      {/* ================================================================== */}
      {adjustingRoomItem && (
        <div className="fixed inset-0 z-60 bg-[#0F0E17]/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white border border-[#E8E6F2] rounded-2xl sm:rounded-3xl shadow-2xl max-w-xl w-[calc(100vw-24px)] sm:w-full p-4 sm:p-7 space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#F0EEFF] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F0EEFF] text-[#5146D8] flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#24213A]">
                    Adjust Room Rate
                  </h3>
                  <p className="text-xs text-[#77758F] mt-0.5">
                    Room: <strong className="text-[#24213A]">{currentAdjustRoomTitle}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingRoomItem(null)}
                className="p-1.5 rounded-xl text-[#77758F] hover:text-[#24213A] hover:bg-[#F0EEFF] transition-colors cursor-pointer"
                title="Cancel and close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Pricing Overview Card */}
            <div className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-2xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#77758F] block">Current Rate</span>
                  <span className="font-mono font-bold text-sm text-[#24213A] mt-0.5 block">
                    ₹{currentAdjustOldRate.toLocaleString('en-IN')}/night
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#77758F] block">Stay Duration</span>
                  <span className="font-semibold text-sm text-[#24213A] mt-0.5 block">
                    {currentAdjustOldQty} Night{currentAdjustOldQty > 1 ? "s" : ""}
                  </span>
                  {adjustingRoomItem.stayPeriod && (
                    <span className="text-[10px] font-mono text-[#5146D8] block mt-0.5">
                      {adjustingRoomItem.stayPeriod}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#77758F] block">Current Total</span>
                  <span className="font-mono font-bold text-sm text-[#24213A] mt-0.5 block">
                    ₹{currentAdjustOldTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Server / Mutation Error Alert */}
            {adjustError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            {/* Section: New Pricing */}
            <div className="space-y-3.5">
              <div className="border-b border-[#F0EEFF] pb-1.5">
                <span className="text-xs font-bold text-[#24213A] uppercase tracking-wider">
                  New Pricing
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                {/* New Nightly Rate input */}
                <div>
                  <label className="text-xs font-semibold text-[#24213A] block mb-1.5">
                    New Nightly Rate (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#77758F]">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={adjustRateVal}
                      onChange={(e) => setAdjustRateVal(e.target.value)}
                      placeholder="e.g. 2999"
                      className={cn(
                        "w-full h-10 pl-7 pr-3 text-sm font-mono font-bold bg-white border rounded-xl focus:outline-none focus:border-[#5146D8] text-[#24213A]",
                        !isAdjustRateValid && adjustRateVal !== "" ? "border-rose-400 bg-rose-50/20" : "border-[#E8E6F2]"
                      )}
                    />
                  </div>
                  {!isAdjustRateValid && adjustRateVal !== "" && (
                    <span className="text-[11px] text-rose-600 block mt-1">
                      Please enter a valid positive nightly rate.
                    </span>
                  )}
                </div>

                {/* Number of Nights input */}
                <div>
                  <label className="text-xs font-semibold text-[#24213A] block mb-1.5">
                    Number of Nights
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={adjustQtyVal}
                    onChange={(e) => setAdjustQtyVal(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full h-10 px-3 text-sm font-mono bg-white border border-[#E8E6F2] rounded-xl focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                  />
                  <span className="text-[11px] text-[#77758F] block mt-1">
                    Current booking duration: <strong>{numberOfNights} night{numberOfNights > 1 ? "s" : ""}</strong>
                  </span>
                </div>
              </div>

              {/* Side-by-Side Comparison Card */}
              <div className="bg-[#FAF9FF] border border-[#E8E6F2] rounded-2xl p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs items-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#77758F] block">Original Total</span>
                    <span className="font-mono text-sm font-bold text-[#77758F] line-through mt-0.5 block">
                      ₹{currentAdjustOldTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#5146D8] block">Revised Total</span>
                    <span className="font-mono text-base font-black text-[#5146D8] mt-0.5 block">
                      ₹{currentAdjustNewTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#77758F] block">Difference</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        "font-mono text-xs font-bold px-2 py-0.5 rounded-lg",
                        currentAdjustDiff < 0
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : currentAdjustDiff > 0
                            ? "bg-indigo-100 text-indigo-900 border border-indigo-200"
                            : "bg-gray-100 text-gray-700"
                      )}>
                        {currentAdjustDiff > 0 ? `+₹${currentAdjustDiff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : currentAdjustDiff < 0 ? `-₹${Math.abs(currentAdjustDiff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "₹0.00"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rate Decrease Warning */}
              {isAdjustmentDecreasing && !isBelowPaidAmount && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-bold block">Folio Concession / Rate Decrease</span>
                    <span>This adjustment will reduce the room charge by <strong>₹{Math.abs(currentAdjustDiff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>. Please ensure this rate reduction has manager approval.</span>
                  </div>
                </div>
              )}

              {/* Financial Lock / Below Amount Paid Warning */}
              {isBelowPaidAmount && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <span className="font-bold block">Adjustment Rejected (Financial Integrity)</span>
                    <span>The new folio grand total (₹{hypotheticalFolioTotal.toLocaleString('en-IN')}) would be less than payments already collected (₹{calculations.amountPaid.toLocaleString('en-IN')}). Please process a refund or adjustment before reducing charges below collected payments.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Section: Reason for Adjustment */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between border-b border-[#F0EEFF] pb-1.5">
                <span className="text-xs font-bold text-[#24213A] uppercase tracking-wider">
                  Reason for Adjustment <span className="text-rose-500">*</span>
                </span>
                {adjustReasonCategory && (
                  <span className="text-[11px] text-[#5146D8] font-medium">
                    Selected: {adjustReasonCategory}
                  </span>
                )}
              </div>

              {/* Selectable Options */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROOM_ADJUSTMENT_REASON_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setAdjustReasonCategory(opt);
                      if (opt !== "Other") setAdjustCustomReason("");
                    }}
                    className={cn(
                      "px-3 py-2.5 rounded-xl text-xs font-semibold border text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer",
                      adjustReasonCategory === opt
                        ? "bg-[#F0EEFF] border-[#5146D8] text-[#5146D8] shadow-xs ring-1 ring-[#5146D8]"
                        : "bg-white border-[#E8E6F2] text-[#77758F] hover:border-[#5146D8]/40 hover:text-[#24213A]"
                    )}
                  >
                    <span>{opt}</span>
                    {adjustReasonCategory === opt && <Check className="w-3.5 h-3.5 text-[#5146D8] shrink-0" />}
                  </button>
                ))}
              </div>

              {/* If 'Other' is selected, require custom explanation */}
              {adjustReasonCategory === "Other" ? (
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-[#24213A] block">
                    Custom Reason / Explanation <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter business reason for this custom rate adjustment..."
                    value={adjustCustomReason}
                    onChange={(e) => setAdjustCustomReason(e.target.value)}
                    className={cn(
                      "w-full h-10 px-3 text-xs bg-white border rounded-xl focus:outline-none focus:border-[#5146D8] text-[#24213A]",
                      !adjustCustomReason.trim() ? "border-rose-300 bg-rose-50/20" : "border-[#E8E6F2]"
                    )}
                  />
                  {!adjustCustomReason.trim() && (
                    <span className="text-[11px] text-rose-600 block">
                      A custom explanation is required when selecting 'Other'.
                    </span>
                  )}
                </div>
              ) : adjustReasonCategory ? (
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] font-semibold text-[#77758F] block">
                    Additional Notes / Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Approved by Owner for regular homestay guest"
                    value={adjustCustomReason}
                    onChange={(e) => setAdjustCustomReason(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-[#E8E6F2] rounded-xl focus:outline-none focus:border-[#5146D8] text-[#24213A]"
                  />
                </div>
              ) : (
                <span className="text-[11px] text-rose-600 block">
                  Please select an adjustment reason above.
                </span>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#F0EEFF]">
              <button
                type="button"
                onClick={() => setAdjustingRoomItem(null)}
                className="px-4 py-2 bg-white border border-[#E8E6F2] hover:bg-[#F6F5FC] text-[#24213A] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveRoomAdjustment}
                disabled={!canSaveAdjustment}
                className="px-5 py-2.5 bg-[#5146D8] hover:bg-[#4338CA] text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isAdjustingRate ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Saving Rate Adjustment...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save Rate Adjustment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* INSTANT PAYMENT RECEIPT MODAL                                      */}
      {/* ================================================================== */}
      <PaymentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        receipt={selectedReceipt}
        isLoading={isLoadingReceipt}
      />

      {/* Offscreen container for high-fidelity client-side PDF rendering */}
      {liveInvoice && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: "-99999px",
            top: 0,
            width: "794px",
            zIndex: -9999,
            pointerEvents: "none",
          }}
        >
          <div
            id="hms-pdf-capture-root"
            style={{
              width: "794px",
              background: "#ffffff",
              padding: "0px",
              margin: "0px",
            }}
          >
            <InvoicePDFView
              invoice={liveInvoice}
              homestay={currentHomestay}
              isPrintVersion={false}
            />
          </div>
        </div>
      )}

      {/* Print Portal for physical print layout */}
      <InvoicePrintPortal
        invoice={liveInvoice}
        homestay={currentHomestay}
      />
    </>
  );
}
