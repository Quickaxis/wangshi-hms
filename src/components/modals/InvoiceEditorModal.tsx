"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { 
  DbInvoice, 
  DbBooking, 
  CreateInvoiceItemInput, 
  InvoiceItemCategory, 
  PaymentMethod,
  DbPayment
} from "@/lib/types";
import { 
  createInvoiceAction, 
  updateInvoiceAction, 
  recordInvoicePaymentAction 
} from "@/app/actions/invoices";
import { calculateInvoiceTotals } from "@/lib/money";
import { formatISTCompactDate } from "@/lib/dateUtils";
import { createClient } from "@/lib/supabase/client";
import { useHMSContext } from "@/components/providers/HMSProvider";
import { InvoicePDFView } from "@/components/invoicing/InvoicePDFView";
import { InvoicePrintPortal, triggerBrowserPrint } from "@/components/invoicing/InvoicePrintPortal";
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
  ChevronRight,
  FileText,
  User,
  BedDouble,
  Hash,
  Percent,
  X,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking?: DbBooking | null;
  existingInvoice?: DbInvoice | null;
  onSaved: (invoiceId: string, updatedInvoice?: DbInvoice, shouldClose?: boolean) => void;
}

const CATEGORY_OPTIONS: { label: string; value: InvoiceItemCategory }[] = [
  { label: "Custom Service", value: "custom" },
  { label: "Room Charge", value: "room" },
  { label: "Food & Beverages", value: "food_beverage" },
  { label: "Laundry Service", value: "laundry" },
  { label: "Extra Bed / Mattress", value: "extra_bed" },
  { label: "Additional Nights", value: "additional_nights" },
  { label: "Concession / Waiver", value: "discount" },
];

const DEFAULT_SUGGESTED_ITEMS = [
  "Airport Pickup",
  "Airport Drop",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Room Decoration",
  "Guide Charges",
  "River Cruise",
  "Late Checkout",
  "Early Check-in",
  "Extra Mattress",
  "Extra Bed",
  "Bonfire & BBQ",
  "Laundry Service",
  "Local Sightseeing Taxi",
  "Tea & Snacks",
  "Packed Lunch",
  "Bicycle Rental",
  "Boating / Water Sports"
];

export function InvoiceEditorModal({
  isOpen,
  onClose,
  booking,
  existingInvoice,
  onSaved
}: InvoiceEditorModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { homestays, selectedHomestayId } = useHMSContext();

  // Selected Homestay for preview branding
  const currentHomestay = useMemo(() => {
    return homestays.find(h => h.id === (existingInvoice?.homestay_id || booking?.homestay_id || selectedHomestayId)) || homestays[0] || null;
  }, [homestays, existingInvoice, booking, selectedHomestayId]);

  // View state: split-screen preview toggle
  const [showPreview, setShowPreview] = useState<boolean>(true);

  // Tabs for Left Panel
  const [activeTab, setActiveTab] = useState<"items" | "payments">("items");

  // Booking selection (when creating new invoice without preselected booking)
  const [availableBookings, setAvailableBookings] = useState<DbBooking[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);

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
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [localPayments, setLocalPayments] = useState<DbPayment[]>([]);

  // Action status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Unsaved changes confirmation dialog
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Initial State Snapshot to detect unsaved changes
  const initialSnapshotRef = useRef<string>("");

  // Helper to serialize current form state
  const getSnapshot = useCallback(() => {
    return JSON.stringify({
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      dueDate,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim(),
      guestAddress: guestAddress.trim(),
      roomName: roomName.trim(),
      checkIn,
      checkOut,
      taxRate,
      flatDiscount,
      notes: notes.trim(),
      houseRules: houseRules.trim(),
      selectedBookingId,
      items: items.map(it => ({
        cat: it.category,
        desc: it.description.trim(),
        qty: Number(it.quantity) || 1,
        rate: Number(it.rate) || 0,
        comp: !!it.is_complimentary,
      }))
    });
  }, [
    invoiceNumber, invoiceDate, dueDate, guestName, guestPhone, guestEmail, guestAddress,
    roomName, checkIn, checkOut, taxRate, flatDiscount, notes, houseRules,
    selectedBookingId, items
  ]);

  // Reset and Initialize Form
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setPaymentError(null);
    setPaymentSuccess(null);
    setShowDiscardConfirm(false);
    setActiveTab("items");
    setPaymentAmount("");
    setPaymentRef("");
    setPaymentNotes("");

    if (existingInvoice) {
      setInvoiceNumber(existingInvoice.invoice_number || "");
      setInvoiceDate(existingInvoice.invoice_date || new Date().toISOString().split("T")[0]);
      setDueDate(existingInvoice.check_out || existingInvoice.invoice_date || "");
      setGuestName(existingInvoice.guest_name || "");
      setGuestPhone(existingInvoice.guest_phone || "");
      setGuestEmail(existingInvoice.guest_email || "");
      setGuestAddress(existingInvoice.guest_address || "");
      setRoomName(existingInvoice.room_name || "");
      setCheckIn(existingInvoice.check_in || "");
      setCheckOut(existingInvoice.check_out || "");
      setTaxRate(Number(existingInvoice.tax_rate) || 0);

      const existingItemDiscount = (existingInvoice.items || [])
        .filter(i => i.category === 'discount')
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const derivedFlatDiscount = Math.max(0, (Number(existingInvoice.discount_amount) || 0) - existingItemDiscount);
      setFlatDiscount(derivedFlatDiscount);

      setNotes(existingInvoice.notes || "");
      setHouseRules(existingInvoice.house_rules || "");
      setSelectedBookingId(existingInvoice.booking_id || "");
      setLocalPayments(existingInvoice.payments || []);

      const mappedItems = (existingInvoice.items || []).map(i => ({
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

      initialSnapshotRef.current = JSON.stringify({
        invoiceNumber: (existingInvoice.invoice_number || "").trim(),
        invoiceDate: existingInvoice.invoice_date || "",
        dueDate: existingInvoice.check_out || existingInvoice.invoice_date || "",
        guestName: (existingInvoice.guest_name || "").trim(),
        guestPhone: (existingInvoice.guest_phone || "").trim(),
        guestEmail: (existingInvoice.guest_email || "").trim(),
        guestAddress: (existingInvoice.guest_address || "").trim(),
        roomName: (existingInvoice.room_name || "").trim(),
        checkIn: existingInvoice.check_in || "",
        checkOut: existingInvoice.check_out || "",
        taxRate: Number(existingInvoice.tax_rate) || 0,
        flatDiscount: derivedFlatDiscount,
        notes: (existingInvoice.notes || "").trim(),
        houseRules: (existingInvoice.house_rules || "").trim(),
        selectedBookingId: existingInvoice.booking_id || "",
        items: mappedItems.map(it => ({
          cat: it.category,
          desc: it.description.trim(),
          qty: Number(it.quantity) || 1,
          rate: Number(it.rate) || 0,
          comp: !!it.is_complimentary,
        }))
      });
    } else if (booking) {
      applyBookingDetails(booking);
    } else {
      // Blank new invoice
      const today = new Date().toISOString().split("T")[0];
      setInvoiceNumber("");
      setInvoiceDate(today);
      setDueDate(today);
      setGuestName("");
      setGuestPhone("");
      setGuestEmail("");
      setGuestAddress("");
      setRoomName("");
      setCheckIn(today);
      setCheckOut(today);
      setTaxRate(0);
      setFlatDiscount(0);
      setNotes("");
      setHouseRules("");
      setSelectedBookingId("");
      setLocalPayments([]);
      setItems([
        {
          category: "room",
          description: "Room Accommodation Charge",
          quantity: 1,
          rate: 1500,
          amount: 1500,
          sort_order: 0,
          is_complimentary: false
        }
      ]);

      initialSnapshotRef.current = JSON.stringify({
        invoiceNumber: "",
        invoiceDate: today,
        dueDate: today,
        guestName: "",
        guestPhone: "",
        guestEmail: "",
        guestAddress: "",
        roomName: "",
        checkIn: today,
        checkOut: today,
        taxRate: 0,
        flatDiscount: 0,
        notes: "",
        houseRules: "",
        selectedBookingId: "",
        items: [{ cat: "room", desc: "Room Accommodation Charge", qty: 1, rate: 1500, comp: false }]
      });

      fetchAvailableBookings();
    }
  }, [isOpen, existingInvoice, booking]);

  // Pre-fill from selected booking
  const applyBookingDetails = (b: DbBooking) => {
    setSelectedBookingId(b.id);
    const primaryGuest = b.guests && b.guests.length > 0 ? b.guests[0] : null;
    const gName = primaryGuest?.name || (b as any).guest_name || "";
    const gPhone = primaryGuest?.phone || (b as any).guest_phone || "";
    const gEmail = primaryGuest?.email || (b as any).guest_email || "";
    const gCity = (primaryGuest as any)?.city || (b as any).guest_address || "";

    const rName = b.rooms?.name || (b as any).room_name || "Assigned Room";
    const cin = b.check_in;
    const cout = b.check_out;
    const invDate = new Date().toISOString().split("T")[0];

    setInvoiceNumber("");
    setInvoiceDate(invDate);
    setDueDate(cout || invDate);
    setGuestName(gName);
    setGuestPhone(gPhone);
    setGuestEmail(gEmail);
    setGuestAddress(gCity);
    setRoomName(rName);
    setCheckIn(cin);
    setCheckOut(cout);
    setTaxRate(0);
    setFlatDiscount(0);
    setNotes(b.notes || "");
    setHouseRules("");
    setLocalPayments([]);

    let stayNights = 1;
    if (cin && cout) {
      const d1 = new Date(cin).getTime();
      const d2 = new Date(cout).getTime();
      const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      if (diff > 0) stayNights = diff;
    }

    const totalAmt = Number(b.total_amount) || 1500;
    const nightlyRate = Number((totalAmt / stayNights).toFixed(2));

    const initialItems: CreateInvoiceItemInput[] = [
      {
        category: "room",
        description: `${rName} – ${stayNights} Night Stay`,
        stay_period: `${cin} to ${cout}`,
        quantity: stayNights,
        rate: nightlyRate,
        amount: totalAmt,
        sort_order: 0,
        is_complimentary: false,
      }
    ];

    setItems(initialItems);

    initialSnapshotRef.current = JSON.stringify({
      invoiceNumber: "",
      invoiceDate: invDate,
      dueDate: cout || invDate,
      guestName: gName.trim(),
      guestPhone: gPhone.trim(),
      guestEmail: gEmail.trim(),
      guestAddress: gCity.trim(),
      roomName: rName.trim(),
      checkIn: cin,
      checkOut: cout,
      taxRate: 0,
      flatDiscount: 0,
      notes: (b.notes || "").trim(),
      houseRules: "",
      selectedBookingId: b.id,
      items: initialItems.map(it => ({
        cat: it.category,
        desc: it.description.trim(),
        qty: Number(it.quantity) || 1,
        rate: Number(it.rate) || 0,
        comp: false,
      }))
    });
  };

  // Fetch unbilled/active bookings when creating fresh invoice
  const fetchAvailableBookings = async () => {
    setIsLoadingBookings(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          check_in,
          check_out,
          total_amount,
          status,
          homestay_id,
          rooms (name),
          guests (name, phone, email, is_primary)
        `)
        .order("created_at", { ascending: false })
        .limit(25);

      if (!error && data) {
        setAvailableBookings(data as any);
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingBookings(false);
    }
  };

  // Detect Unsaved Changes
  const hasUnsavedChanges = useMemo(() => {
    if (!initialSnapshotRef.current) return false;
    return getSnapshot() !== initialSnapshotRef.current;
  }, [getSnapshot]);

  // Close Request with Unsaved Changes Guard
  const handleRequestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  // Keyboard accessibility: Escape key handling
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showDiscardConfirm, handleRequestClose]);

  // Real-time calculation of stay nights
  const computedNights = useMemo(() => {
    if (!checkIn || !checkOut) return 1;
    const d1 = new Date(checkIn).getTime();
    const d2 = new Date(checkOut).getTime();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [checkIn, checkOut]);

  // Real-time calculation of totals
  const calculations = useMemo(() => {
    return calculateInvoiceTotals(items, taxRate, flatDiscount, localPayments as any[]);
  }, [items, taxRate, flatDiscount, localPayments]);

  // Percentage settled
  const percentageSettled = useMemo(() => {
    if (calculations.grandTotal <= 0) return 100;
    const pct = Math.round((calculations.amountPaid / calculations.grandTotal) * 100);
    return Math.min(Math.max(pct, 0), 100);
  }, [calculations]);

  // Financial immutability lock: active when invoice has recorded payments
  const isFinancialLocked = useMemo(() => {
    return (localPayments && localPayments.length > 0) || Number(existingInvoice?.amount_paid || 0) > 0;
  }, [localPayments, existingInvoice]);

  // Derived suggestions for item names (from hospitality standard + existing invoice items)
  const suggestedItemNames = useMemo(() => {
    const set = new Set<string>(DEFAULT_SUGGESTED_ITEMS);
    if (existingInvoice?.items) {
      existingInvoice.items.forEach(i => {
        if (i.description && i.description.trim()) set.add(i.description.trim());
      });
    }
    items.forEach(i => {
      if (i.description && i.description.trim()) set.add(i.description.trim());
    });
    return Array.from(set);
  }, [existingInvoice, items]);

  // Stable Draft Invoice Number for new unsaved folios
  const draftInvoiceNumber = useMemo(() => {
    const prefix = currentHomestay?.name
      ? currentHomestay.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase()
      : "WNG";
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `INV-${prefix}-${yyyy}${mm}${dd}-${randomSuffix}`;
  }, [currentHomestay]);

  // Reactive Live Invoice Document object for Right Panel preview
  const liveInvoice: DbInvoice = useMemo(() => {
    return {
      id: existingInvoice?.id || "preview-folio",
      homestay_id: existingInvoice?.homestay_id || booking?.homestay_id || currentHomestay?.id || "",
      booking_id: existingInvoice?.booking_id || booking?.id || selectedBookingId || "",
      invoice_number: invoiceNumber.trim() || existingInvoice?.invoice_number || draftInvoiceNumber,
      invoice_date: invoiceDate || new Date().toISOString().split("T")[0],
      status: (calculations.paymentStatus as any) || "unpaid",
      guest_name: guestName || "Guest Name",
      guest_phone: guestPhone || null,
      guest_email: guestEmail || null,
      guest_address: guestAddress || null,
      check_in: checkIn || new Date().toISOString().split("T")[0],
      check_out: checkOut || new Date().toISOString().split("T")[0],
      room_id: existingInvoice?.room_id || booking?.room_id || null,
      room_name: roomName || "Standard Accommodation",
      subtotal: calculations.subtotal,
      tax_rate: taxRate,
      tax_amount: calculations.taxAmount,
      discount_amount: calculations.discountAmount,
      grand_total: calculations.grandTotal,
      amount_paid: calculations.amountPaid,
      balance_due: calculations.balanceDue,
      notes: notes.trim() || null,
      house_rules: houseRules.trim() || null,
      created_at: existingInvoice?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: items.map((it, idx) => ({
        id: it.id || `preview-item-${idx}`,
        invoice_id: existingInvoice?.id || "preview-folio",
        homestay_id: existingInvoice?.homestay_id || "",
        category: it.category || "custom",
        description: it.description || "Charge item",
        stay_period: it.stay_period || null,
        quantity: Number(it.quantity) || 1,
        rate: Number(it.rate) || 0,
        amount: Number(it.amount) || (Number(it.quantity || 1) * Number(it.rate || 0)),
        sort_order: it.sort_order ?? idx,
        is_complimentary: it.is_complimentary,
        created_at: new Date().toISOString()
      })),
      payments: localPayments,
      homestay: currentHomestay || existingInvoice?.homestay || undefined,
      bookings: booking || existingInvoice?.bookings || undefined
    };
  }, [
    existingInvoice, booking, currentHomestay, selectedBookingId,
    invoiceNumber, draftInvoiceNumber, invoiceDate, calculations, guestName, guestPhone,
    guestEmail, guestAddress, checkIn, checkOut, roomName, taxRate,
    notes, houseRules, items, localPayments
  ]);

  // Item change handler
  const handleItemChange = (index: number, field: keyof CreateInvoiceItemInput, value: any) => {
    if (isFinancialLocked) return;
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === "quantity" || field === "rate") {
        const qty = parseFloat(item.quantity as any) || 0;
        const rate = parseFloat(item.rate as any) || 0;
        item.amount = Number((qty * rate).toFixed(2));
      } else if (field === "is_complimentary" && value === true) {
        item.rate = 0;
        item.amount = 0;
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddItem = (category: InvoiceItemCategory = "custom", defaultDesc = "", defaultRate = 0) => {
    if (isFinancialLocked) return;
    setItems(prev => [
      ...prev,
      {
        category,
        description: defaultDesc,
        stay_period: "",
        quantity: 1,
        rate: defaultRate,
        amount: defaultRate,
        sort_order: prev.length,
        is_complimentary: false,
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (isFinancialLocked) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Quick fill remaining balance in payment tab
  const handleQuickFillDue = () => {
    if (calculations.balanceDue > 0) {
      setPaymentAmount(calculations.balanceDue.toString());
    }
  };

  // Print Document handler
  const handlePrint = async () => {
    await triggerBrowserPrint({
      targetContainerId: "hms-invoice-print-root",
      invoiceNumber: liveInvoice.invoice_number
    });
  };

  // Submit Invoice (Create or Update)
  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!guestName.trim()) {
      setErrorMsg("Primary Guest Name is required.");
      return;
    }
    if (!checkIn || !checkOut) {
      setErrorMsg("Check-in and Check-out dates are required.");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setErrorMsg("Check-out date must be after check-in date.");
      return;
    }
    if (flatDiscount < 0) {
      setErrorMsg("Discount amount cannot be negative.");
      return;
    }
    if (calculations.discountAmount > calculations.subtotal) {
      setErrorMsg(`Total discount (₹${calculations.discountAmount}) cannot exceed gross subtotal (₹${calculations.subtotal}).`);
      return;
    }

    if (!isFinancialLocked) {
      if (items.length === 0) {
        setErrorMsg("Please add at least one line item to the invoice.");
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.description || !it.description.trim()) {
          setErrorMsg(`Item #${i + 1} is missing a Service / Item Name.`);
          return;
        }
        const qty = Number(it.quantity);
        if (isNaN(qty) || qty < 1) {
          setErrorMsg(`Quantity must be at least 1 for "${it.description.trim()}".`);
          return;
        }
        const rate = Number(it.rate);
        if (isNaN(rate) || rate < 0) {
          setErrorMsg(`Rate cannot be negative for "${it.description.trim()}".`);
          return;
        }
        if (rate === 0 && it.category !== 'discount' && !it.is_complimentary) {
          setErrorMsg(`Rate cannot be ₹0 for "${it.description.trim()}". Mark as complimentary if intended.`);
          return;
        }
      }
    }

    const targetBookingId = existingInvoice?.booking_id || booking?.id || selectedBookingId;
    if (!targetBookingId) {
      setErrorMsg("Please select a booking reservation to associate with this invoice.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (existingInvoice) {
        // Enforce immutability for paid invoices: omit locked contract fields and financial items
        const res = await updateInvoiceAction({
          id: existingInvoice.id,
          invoiceNumber: isFinancialLocked ? undefined : (invoiceNumber.trim() || undefined),
          invoiceDate: isFinancialLocked ? undefined : (invoiceDate || undefined),
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim() || null,
          guestEmail: guestEmail.trim() || null,
          guestAddress: guestAddress.trim() || null,
          roomName: isFinancialLocked ? undefined : (roomName.trim() || undefined),
          checkIn: isFinancialLocked ? undefined : checkIn,
          checkOut: isFinancialLocked ? undefined : checkOut,
          items: isFinancialLocked ? undefined : items,
          taxRate: isFinancialLocked ? undefined : taxRate,
          discountAmount: isFinancialLocked ? undefined : flatDiscount,
          notes: notes.trim() || null,
          houseRules: houseRules.trim() || null,
        });

        if (res.success && res.invoice) {
          setSuccessMsg("Invoice updated successfully!");
          initialSnapshotRef.current = getSnapshot();
          onSaved(res.invoice.id, res.invoice, true);
          return;
        }

        setErrorMsg(res.error || "Failed to update invoice.");
      } else {
        const res = await createInvoiceAction({
          bookingId: targetBookingId,
          invoiceNumber: invoiceNumber.trim() || undefined,
          invoiceDate: invoiceDate || undefined,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim() || null,
          guestEmail: guestEmail.trim() || null,
          guestAddress: guestAddress.trim() || null,
          roomName: roomName.trim() || undefined,
          checkIn,
          checkOut,
          items,
          taxRate,
          discountAmount: flatDiscount,
          notes: notes.trim() || null,
          houseRules: houseRules.trim() || null,
        });

        if (res.success && res.invoiceId) {
          setSuccessMsg("Invoice generated and saved successfully!");
          initialSnapshotRef.current = getSnapshot();
          onSaved(res.invoiceId, res.invoice, true);
          return;
        }

        setErrorMsg(res.error || "Failed to generate invoice.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred while saving the invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Payment Recording Action
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecordingPayment) return;

    if (!existingInvoice) {
      setPaymentError("Save this invoice before recording ledger transactions.");
      return;
    }

    const amt = parseFloat(paymentAmount);
    if (!amt || isNaN(amt) || amt <= 0) {
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
      const idempotencyKey = `inv-pay-${existingInvoice.id}-${Date.now()}`;
      const res = await recordInvoicePaymentAction({
        invoiceId: existingInvoice.id,
        amount: amt,
        paymentMethod,
        transactionRef: paymentRef.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        idempotencyKey
      });

      if (res.success && res.invoice) {
        setPaymentSuccess(`Payment of ₹${amt.toLocaleString("en-IN")} recorded successfully.`);
        setPaymentAmount("");
        setPaymentRef("");
        setPaymentNotes("");

        if (res.invoice.payments) {
          setLocalPayments(res.invoice.payments);
        }

        onSaved(existingInvoice.id, res.invoice, false);
      } else {
        setPaymentError(res.error || "Failed to record payment transaction.");
      }
    } catch (err: any) {
      setPaymentError(err.message || "An unexpected error occurred while recording payment.");
    } finally {
      setIsRecordingPayment(false);
    }
  };

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

  // ─── Reusable light-theme input class helpers ───────────────────────────────
  const inputBase = "w-full h-9 rounded-lg px-3 text-xs text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none transition-colors";
  const inputActive = "bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8]/20";
  const inputLocked = "bg-[#F6F5FC] border border-[#E8E6F2] text-[#77758F] cursor-not-allowed select-none opacity-80";

  return createPortal(
    <>
      {/* Global Light Theme Scrollbar */}
      <style jsx global>{`
        .hms-editor-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .hms-editor-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .hms-editor-scrollbar::-webkit-scrollbar-thumb {
          background: #E8E6F2;
          border-radius: 9999px;
        }
        .hms-editor-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1CDE8;
        }
        .hms-editor-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #E8E6F2 transparent;
        }

        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide all screen editor interface */
          body:has(#hms-invoice-print-root) > *:not(#hms-invoice-print-root),
          body.hms-printing-invoice > *:not(#hms-invoice-print-root) {
            display: none !important;
          }
          #hms-invoice-print-root {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            overflow: visible !important;
            height: auto !important;
          }
          .invoice-print-container {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            min-height: auto !important;
          }
          #printable-live-invoice {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            overflow: visible !important;
            height: auto !important;
          }
        }
      `}</style>

      {/* Mount Dedicated Unconstrained Print Document directly to document.body */}
      {isOpen && (
        <InvoicePrintPortal invoice={liveInvoice} homestay={currentHomestay} />
      )}

      {/* Main Full-Viewport Split-Screen Invoice Builder Workspace — Light Theme */}
      <div className="fixed inset-0 z-[100050] bg-[#F6F5FC] text-[#24213A] flex flex-col overflow-hidden animate-in fade-in duration-150">
        
        {/* TOP TOOLBAR */}
        <header className="h-14 border-b border-[#E8E6F2] bg-white px-3 sm:px-6 flex items-center justify-between shrink-0 z-20 shadow-sm w-full min-w-0">
          {/* Left: Back button + Breadcrumb & Title */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button 
              type="button" 
              onClick={handleRequestClose}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg hover:bg-[#F0EEFF] text-[#77758F] hover:text-[#5146D8] transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="h-4 w-px bg-[#E8E6F2] hidden sm:block shrink-0" />

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-xs text-[#77758F] hidden sm:inline">Invoices</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#77758F] hidden sm:inline shrink-0" />
              <span className="text-xs font-bold sm:font-semibold text-[#24213A] truncate max-w-[85px] min-[400px]:max-w-[130px] sm:max-w-none">
                {existingInvoice ? (existingInvoice.invoice_number || "Edit Folio") : "New Invoice"}
              </span>

              {/* Status Indicator Badge */}
              {existingInvoice && (
                <span className={cn(
                  "ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0 hidden min-[480px]:inline-block",
                  calculations.balanceDue <= 0
                    ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                    : calculations.amountPaid > 0
                    ? "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]"
                    : "bg-[#F6F5FC] text-[#77758F] border-[#E8E6F2]"
                )}>
                  {calculations.balanceDue <= 0 ? "Paid" : calculations.amountPaid > 0 ? "Partially Paid" : "Unpaid"}
                </span>
              )}
            </div>
          </div>

          {/* Right: Preview Toggle, Print, Cancel, Save Button */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Show Preview Toggle */}
            <button
              type="button"
              onClick={() => setShowPreview(prev => !prev)}
              className={cn(
                "p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0",
                showPreview
                  ? "bg-[#F0EEFF] text-[#5146D8] border-[#E8E6F2]"
                  : "bg-white text-[#77758F] border-[#E8E6F2] hover:text-[#24213A] hover:border-[#5146D8]/40"
              )}
              title="Toggle Live Document Preview"
            >
              <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Preview</span>
              <div className={cn(
                "w-7 h-4 rounded-full transition-colors p-0.5 relative items-center hidden sm:flex",
                showPreview ? "bg-[#5146D8]" : "bg-[#E8E6F2]"
              )}>
                <div className={cn(
                  "w-3 h-3 rounded-full bg-white transition-transform duration-150 shadow-sm",
                  showPreview ? "translate-x-3" : "translate-x-0"
                )} />
              </div>
            </button>

            {/* Print / PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-[#F6F5FC] text-[#77758F] hover:text-[#24213A] border border-[#E8E6F2] hover:border-[#5146D8]/40 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Print / PDF Document"
            >
              <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline">Print / PDF</span>
            </button>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-2 sm:px-3 py-1.5 text-xs font-medium text-[#77758F] hover:text-[#24213A] transition-colors shrink-0"
            >
              Cancel
            </button>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#5146D8] hover:bg-[#4338CA] text-white transition-colors flex items-center gap-1.5 shadow-sm shadow-[#5146D8]/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer shrink-0 whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{existingInvoice ? "Save Changes" : "Save Invoice"}</span>
              )}
            </button>
          </div>
        </header>

        {/* MAIN BODY: Split-Screen Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* LEFT PANEL: Form Editor */}
          <div className={cn(
            "h-full overflow-y-auto hms-editor-scrollbar transition-all duration-200 bg-[#F6F5FC] min-w-0",
            showPreview 
              ? "w-full lg:w-1/2 xl:w-7/12 px-3.5 sm:px-8 py-4 sm:py-6 border-r border-[#E8E6F2]" 
              : "w-full px-3.5 sm:px-10 lg:px-12 py-4 sm:py-8"
          )}>
            <div className={cn("space-y-4 sm:space-y-6 min-w-0", !showPreview && "max-w-[1160px] mx-auto w-full")}>
              
              {/* Notification Alerts */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1">
                    <span className="font-semibold text-rose-800 block">Unable to save invoice</span>
                    <span>{errorMsg}</span>
                  </div>
                  <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-700 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center gap-2.5 text-xs text-[#059669]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#059669]" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Financial Immutability Notice (When payments exist) — Soft Amber Treatment */}
              {isFinancialLocked && (
                <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl flex items-start gap-3 text-xs text-[#92400E]">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                  <div className="flex-1">
                    <span className="font-semibold text-[#B45309] block mb-0.5">
                      Financial Lock Active (Payments Recorded)
                    </span>
                    <span className="text-[#78350F]">
                      This folio has ₹{Number(existingInvoice?.amount_paid || calculations.amountPaid).toLocaleString("en-IN")} in recorded ledger payments. Line items, charges, taxes, discounts, accommodation, and contract dates are locked to preserve accounting integrity. Guest and reservation details can be edited safely.
                    </span>
                  </div>
                </div>
              )}

              {/* Segmented Navigation Tabs */}
              <div className="flex items-center justify-between border-b border-[#E8E6F2] pb-3">
                <div className="inline-flex p-1 bg-white border border-[#E8E6F2] rounded-xl gap-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setActiveTab("items")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer",
                      activeTab === "items" 
                        ? "bg-[#5146D8] text-white shadow-sm shadow-[#5146D8]/20" 
                        : "text-[#77758F] hover:text-[#24213A] hover:bg-[#F6F5FC]"
                    )}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Invoice & Charges ({items.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("payments")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer",
                      activeTab === "payments" 
                        ? "bg-[#5146D8] text-white shadow-sm shadow-[#5146D8]/20" 
                        : "text-[#77758F] hover:text-[#24213A] hover:bg-[#F6F5FC]"
                    )}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Payment Ledger ({localPayments.length})</span>
                    {calculations.balanceDue > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                    )}
                  </button>
                </div>

                {/* Settlement Progress */}
                <div className="hidden sm:flex items-center gap-2 text-xs text-[#77758F]">
                  <span>Settled:</span>
                  <div className="w-16 h-1.5 bg-[#E8E6F2] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#059669] transition-all duration-300" 
                      style={{ width: `${percentageSettled}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-[#24213A] font-semibold">{percentageSettled}%</span>
                </div>
              </div>

              {/* ─── TAB 1: INVOICE & CHARGES FORM ─────────────────────────────── */}
              {activeTab === "items" && (
                <div className="space-y-6">
                  
                  {/* SECTION A: Invoice Information */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77758F] flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-[#5146D8]" />
                        <span>Invoice Information</span>
                      </h3>
                      <span className="text-[11px] text-[#77758F] font-mono">
                        {existingInvoice ? "EXISTING FOLIO" : "NEW REGISTRATION"}
                      </span>
                    </div>

                    {/* Booking Selector (if creating new invoice without preselected booking) */}
                    {!existingInvoice && !booking && (
                      <div className="bg-[#F0EEFF] p-3 rounded-xl border border-[#E8E6F2] space-y-1.5">
                        <label className="text-xs font-semibold text-[#5146D8] block">
                          Select Booking Reservation *
                        </label>
                        <select
                          value={selectedBookingId}
                          onChange={(e) => {
                            const bId = e.target.value;
                            setSelectedBookingId(bId);
                            const matched = availableBookings.find(b => b.id === bId);
                            if (matched) applyBookingDetails(matched);
                          }}
                          disabled={isLoadingBookings}
                          className="w-full h-9 bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-lg px-3 text-xs text-[#24213A] focus:outline-none focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8]/20"
                        >
                          <option value="">-- Choose a reservation to invoice --</option>
                          {availableBookings.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.guests?.[0]?.name || "Guest"} • {b.rooms?.name || "Room"} ({b.check_in} to {b.check_out}) — ₹{b.total_amount}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className={cn(
                      "grid gap-4",
                      showPreview ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    )}>
                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Invoice number</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <input
                          type="text"
                          disabled={isFinancialLocked}
                          readOnly={isFinancialLocked}
                          tabIndex={isFinancialLocked ? -1 : 0}
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder="Auto-generated"
                          className={cn(
                            inputBase, "font-mono tabular-nums",
                            isFinancialLocked ? inputLocked : inputActive
                          )}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Issue date *</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <input
                          type="date"
                          disabled={isFinancialLocked}
                          readOnly={isFinancialLocked}
                          tabIndex={isFinancialLocked ? -1 : 0}
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          className={cn(inputBase, isFinancialLocked ? inputLocked : inputActive)}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Due date</span>
                          {isFinancialLocked && <span title="Locked on paid invoices (Stay contract frozen)"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <input
                          type="date"
                          disabled={isFinancialLocked}
                          readOnly={isFinancialLocked}
                          tabIndex={isFinancialLocked ? -1 : 0}
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className={cn(inputBase, isFinancialLocked ? inputLocked : inputActive)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION B: Guest Information */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77758F] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#5146D8]" />
                        <span>Guest Information</span>
                      </h3>
                      <span className="text-[11px] text-[#059669] font-medium bg-[#ECFDF5] px-2 py-0.5 rounded-full border border-[#A7F3D0]">Always Editable</span>
                    </div>

                    <div className={cn(
                      "grid gap-4",
                      showPreview ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                    )}>
                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                          Primary guest name *
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder="e.g. John Doe"
                          className={cn(inputBase, inputActive)}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                          Contact phone
                        </label>
                        <input
                          type="text"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className={cn(inputBase, inputActive, "font-mono")}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                          Email address
                        </label>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          placeholder="guest@example.com"
                          className={cn(inputBase, inputActive)}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                          Billing address / City
                        </label>
                        <input
                          type="text"
                          value={guestAddress}
                          onChange={(e) => setGuestAddress(e.target.value)}
                          placeholder="City, State, Country"
                          className={cn(inputBase, inputActive)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION C: Stay & Accommodation */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77758F] flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-[#5146D8]" />
                        <span>Stay & Accommodation</span>
                      </h3>
                      <span className="text-xs font-semibold text-[#5146D8]">
                        {computedNights} {computedNights === 1 ? "Night" : "Nights"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Room / Accommodation</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <input
                          type="text"
                          disabled={isFinancialLocked}
                          readOnly={isFinancialLocked}
                          tabIndex={isFinancialLocked ? -1 : 0}
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder="e.g. Deluxe Room"
                          className={cn(inputBase, isFinancialLocked ? inputLocked : inputActive)}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Check-in date *</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <input
                          type="date"
                          disabled={isFinancialLocked}
                          readOnly={isFinancialLocked}
                          tabIndex={isFinancialLocked ? -1 : 0}
                          value={checkIn}
                          onChange={(e) => setCheckIn(e.target.value)}
                          className={cn(inputBase, isFinancialLocked ? inputLocked : inputActive)}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Check-out date *</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <input
                          type="date"
                          disabled={isFinancialLocked}
                          readOnly={isFinancialLocked}
                          tabIndex={isFinancialLocked ? -1 : 0}
                          value={checkOut}
                          onChange={(e) => setCheckOut(e.target.value)}
                          className={cn(inputBase, isFinancialLocked ? inputLocked : inputActive)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION D: Invoice Items & Services */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-5 space-y-4 shadow-sm">
                    {/* Datalist for optional autocomplete suggestions */}
                    <datalist id="item-service-suggestions">
                      {suggestedItemNames.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77758F] flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-[#5146D8]" />
                          <span>Invoice Items & Services ({items.length})</span>
                        </h3>
                        <p className="text-xs text-[#77758F] mt-0.5">
                          Add accommodation, transport, meals, tour guide, or custom services.
                        </p>
                      </div>

                      {!isFinancialLocked ? (
                        <button
                          type="button"
                          onClick={() => handleAddItem("custom", "", 0)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5146D8] hover:bg-[#4338CA] text-white text-xs font-semibold transition-colors shadow-sm shadow-[#5146D8]/20 cursor-pointer self-start sm:self-auto"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add Item</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-[#D97706] flex items-center gap-1 bg-[#FFFBEB] px-2.5 py-1 rounded-full border border-[#FDE68A]">
                          <Lock className="w-3 h-3" />
                          <span>Charges locked (payments recorded)</span>
                        </span>
                      )}
                    </div>

                    {/* Item Cards */}
                    <div className="space-y-3">
                      {items.length === 0 ? (
                        <div className="p-8 text-center text-xs text-[#77758F] bg-[#F6F5FC] rounded-xl border-2 border-dashed border-[#E8E6F2]">
                          <p className="mb-3">No line items added yet.</p>
                          {!isFinancialLocked && (
                            <button
                              type="button"
                              onClick={() => handleAddItem("custom", "", 0)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5146D8] hover:bg-[#4338CA] text-white text-xs font-medium transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>+ Add Item</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        items.map((item, idx) => (
                          <div 
                            key={idx} 
                            className="p-3.5 bg-[#F6F5FC] rounded-xl border border-[#E8E6F2] space-y-2.5 transition-colors hover:border-[#5146D8]/40"
                          >
                            {/* Primary Row: Name & Category & Delete */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                              {/* Item / Service Name */}
                              <div className="sm:col-span-7">
                                <label className="text-[10px] uppercase font-semibold tracking-wider text-[#77758F] mb-1 flex items-center justify-between">
                                  <span>Item / Service Name *</span>
                                  {item.is_complimentary && (
                                    <span className="text-[9px] text-[#059669] font-semibold bg-[#ECFDF5] px-1.5 py-0.5 rounded-full border border-[#A7F3D0]">Complimentary</span>
                                  )}
                                </label>
                                <input
                                  type="text"
                                  list="item-service-suggestions"
                                  disabled={isFinancialLocked}
                                  readOnly={isFinancialLocked}
                                  tabIndex={isFinancialLocked ? -1 : 0}
                                  value={item.description}
                                  onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                                  placeholder="e.g. Airport Pickup, River Cruise, Breakfast..."
                                  className={cn(
                                    "w-full h-8 rounded-lg px-2.5 text-xs text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none transition-colors",
                                    isFinancialLocked
                                      ? "bg-[#F6F5FC] border border-[#E8E6F2] text-[#77758F] cursor-not-allowed select-none opacity-80"
                                      : "bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8]/20"
                                  )}
                                />
                              </div>

                              {/* Category Selector */}
                              <div className="sm:col-span-4">
                                <label className="text-[10px] uppercase font-semibold tracking-wider text-[#77758F] mb-1 block">
                                  Category
                                </label>
                                <select
                                  disabled={isFinancialLocked}
                                  tabIndex={isFinancialLocked ? -1 : 0}
                                  value={item.category}
                                  onChange={(e) => handleItemChange(idx, "category", e.target.value)}
                                  className={cn(
                                    "w-full h-8 border rounded-lg px-2 text-xs text-[#24213A] focus:outline-none transition-colors",
                                    isFinancialLocked 
                                      ? "bg-[#F6F5FC] border-[#E8E6F2] opacity-70 cursor-not-allowed select-none text-[#77758F]" 
                                      : "bg-white border-[#E8E6F2] hover:border-[#5146D8]/40 focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8]/20"
                                  )}
                                >
                                  {CATEGORY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Delete Action */}
                              <div className="sm:col-span-1 flex justify-end sm:pt-4">
                                <button
                                  type="button"
                                  disabled={isFinancialLocked}
                                  tabIndex={isFinancialLocked ? -1 : 0}
                                  onClick={() => handleRemoveItem(idx)}
                                  title={isFinancialLocked ? "Locked" : "Remove item"}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-colors",
                                    isFinancialLocked
                                      ? "text-[#77758F] opacity-40 cursor-not-allowed pointer-events-none"
                                      : "text-[#77758F] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  )}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Secondary Row: Details, Rate, Qty, Amount, Free */}
                            <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center pt-1 border-t border-[#E8E6F2]">
                              {/* Optional Details */}
                              <div className="col-span-2 sm:col-span-5 min-w-0">
                                <input
                                  type="text"
                                  disabled={isFinancialLocked}
                                  readOnly={isFinancialLocked}
                                  tabIndex={isFinancialLocked ? -1 : 0}
                                  value={item.stay_period || ""}
                                  onChange={(e) => handleItemChange(idx, "stay_period", e.target.value)}
                                  placeholder="Optional description (e.g. flight #, dates, specs)..."
                                  className={cn(
                                    "w-full min-w-0 h-7 rounded-lg px-2.5 text-[11px] text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none transition-colors",
                                    isFinancialLocked
                                      ? "bg-[#F6F5FC] border border-[#E8E6F2] text-[#77758F] cursor-not-allowed select-none opacity-80"
                                      : "bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 focus:border-[#5146D8]"
                                  )}
                                />
                              </div>

                              {/* Rate */}
                              <div className="col-span-1 sm:col-span-2 min-w-0">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-[10px] text-[#77758F] shrink-0">Rate:</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    disabled={isFinancialLocked || item.is_complimentary}
                                    readOnly={isFinancialLocked || item.is_complimentary}
                                    tabIndex={isFinancialLocked || item.is_complimentary ? -1 : 0}
                                    value={item.rate}
                                    onChange={(e) => handleItemChange(idx, "rate", e.target.value)}
                                    placeholder="Rate"
                                    className={cn(
                                      "w-full min-w-0 h-7 rounded-lg px-1.5 text-xs text-[#24213A] font-mono tabular-nums text-right focus:outline-none transition-colors",
                                      (isFinancialLocked || item.is_complimentary)
                                        ? "bg-[#F6F5FC] border border-[#E8E6F2] text-[#77758F] cursor-not-allowed select-none opacity-80"
                                        : "bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 focus:border-[#5146D8]"
                                    )}
                                  />
                                </div>
                              </div>

                              {/* Quantity */}
                              <div className="col-span-1 sm:col-span-2 min-w-0">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-[10px] text-[#77758F] shrink-0">Qty:</span>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    disabled={isFinancialLocked}
                                    readOnly={isFinancialLocked}
                                    tabIndex={isFinancialLocked ? -1 : 0}
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                                    placeholder="Qty"
                                    className={cn(
                                      "w-full min-w-0 h-7 rounded-lg px-1.5 text-xs text-[#24213A] font-mono tabular-nums text-center focus:outline-none transition-colors",
                                      isFinancialLocked
                                        ? "bg-[#F6F5FC] border border-[#E8E6F2] text-[#77758F] cursor-not-allowed select-none opacity-80"
                                        : "bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 focus:border-[#5146D8]"
                                    )}
                                  />
                                </div>
                              </div>

                              {/* Amount (Auto calculated) */}
                              <div className="col-span-1 sm:col-span-2 text-left sm:text-right min-w-0">
                                <span className="text-[10px] text-[#77758F] mr-1 sm:hidden">Amt:</span>
                                <span className="font-mono text-xs font-semibold text-[#24213A] tabular-nums truncate">
                                  ₹{Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>

                              {/* Complimentary Checkbox */}
                              <div className="col-span-1 sm:col-span-1 flex items-center justify-end min-w-0">
                                <label className="flex items-center gap-1 text-[10px] text-[#77758F] cursor-pointer select-none" title="Mark as complimentary ₹0 item">
                                  <input
                                    type="checkbox"
                                    disabled={isFinancialLocked}
                                    tabIndex={isFinancialLocked ? -1 : 0}
                                    checked={!!item.is_complimentary}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      handleItemChange(idx, "is_complimentary", checked);
                                      if (checked && Number(item.rate) !== 0) {
                                        handleItemChange(idx, "rate", 0);
                                      }
                                    }}
                                    className="w-3.5 h-3.5 rounded border-[#E8E6F2] bg-white text-[#5146D8] focus:ring-0 focus:ring-offset-0"
                                  />
                                  <span className="hidden sm:inline text-[9px] text-[#77758F]">Free</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {!isFinancialLocked && items.length > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleAddItem("custom", "", 0)}
                          className="text-xs font-semibold text-[#5146D8] hover:text-[#4338CA] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add Item</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SECTION E: Taxes & Concessions */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-3.5 sm:p-5 space-y-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77758F] flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-[#5146D8]" />
                      <span>Taxes & Concessions</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      {/* Tax Rate (GST) */}
                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Applicable Tax Rate (GST)</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          {[0, 5, 12, 18].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              disabled={isFinancialLocked}
                              tabIndex={isFinancialLocked ? -1 : 0}
                              onClick={() => setTaxRate(rate)}
                              className={cn(
                                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border shrink-0",
                                taxRate === rate
                                  ? "bg-[#5146D8] text-white border-[#5146D8] font-semibold shadow-sm"
                                  : "bg-white border-[#E8E6F2] text-[#77758F]",
                                isFinancialLocked 
                                  ? "opacity-50 cursor-not-allowed pointer-events-none" 
                                  : "hover:border-[#5146D8]/40 hover:text-[#5146D8] cursor-pointer"
                              )}
                            >
                              {rate === 0 ? "0%" : `${rate}%`}
                            </button>
                          ))}
                          <div className={cn(
                            "flex items-center rounded-lg px-2 h-9 w-20 sm:w-24 border transition-colors shrink-0",
                            isFinancialLocked
                              ? "bg-[#F6F5FC] border-[#E8E6F2] opacity-60 cursor-not-allowed"
                              : "bg-white border-[#E8E6F2] hover:border-[#5146D8]/40 focus-within:border-[#5146D8]"
                          )}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              disabled={isFinancialLocked}
                              readOnly={isFinancialLocked}
                              tabIndex={isFinancialLocked ? -1 : 0}
                              value={taxRate}
                              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                              className="w-full min-w-0 bg-transparent text-xs text-[#24213A] font-mono tabular-nums text-right outline-none"
                            />
                            <span className="text-xs text-[#77758F] ml-1">%</span>
                          </div>
                        </div>
                      </div>

                      {/* Flat Concession / Discount */}
                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 flex items-center justify-between">
                          <span>Special Concession / Discount (₹)</span>
                          {isFinancialLocked && <span title="Locked on paid invoices"><Lock className="w-3 h-3 text-[#D97706]" /></span>}
                        </label>
                        <div className={cn(
                          "flex items-center rounded-lg px-3 h-9 w-full max-w-[200px] sm:w-48 border transition-colors",
                          isFinancialLocked
                            ? "bg-[#F6F5FC] border-[#E8E6F2] opacity-60 cursor-not-allowed"
                            : "bg-white border-[#E8E6F2] hover:border-[#5146D8]/40 focus-within:border-[#5146D8]"
                        )}>
                          <span className="text-xs text-[#77758F] mr-1.5 font-mono">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            disabled={isFinancialLocked}
                            readOnly={isFinancialLocked}
                            tabIndex={isFinancialLocked ? -1 : 0}
                            value={flatDiscount}
                            onChange={(e) => setFlatDiscount(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full min-w-0 bg-transparent text-xs text-[#24213A] font-mono tabular-nums outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECTION F: Financial Summary */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-3.5 sm:p-5 shadow-sm">
                    <div className="text-[11px] font-semibold text-[#77758F] uppercase tracking-wider pb-3 border-b border-[#E8E6F2] flex justify-between">
                      <span>Financial Summary</span>
                      <span className="font-mono text-[#77758F]">INR (₹)</span>
                    </div>

                    <div className={cn(
                      "grid gap-3 sm:gap-4 text-xs pt-3",
                      showPreview ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
                    )}>
                      <div className="min-w-0">
                        <span className="text-[#77758F] text-[11px] block">Subtotal</span>
                        <span className="font-mono font-semibold text-[#24213A] tabular-nums truncate block">{calculations.formatted.subtotal}</span>
                      </div>

                      <div className="min-w-0">
                        <span className="text-[#77758F] text-[11px] block">Discount</span>
                        <span className="font-mono font-semibold text-rose-600 tabular-nums truncate block">-{calculations.formatted.discountAmount}</span>
                      </div>

                      <div className="min-w-0">
                        <span className="text-[#77758F] text-[11px] block">Tax ({taxRate}%)</span>
                        <span className="font-mono font-semibold text-[#24213A] tabular-nums truncate block">+{calculations.formatted.taxAmount}</span>
                      </div>

                      <div className="pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E8E6F2] min-w-0">
                        <span className="text-[#24213A] text-[11px] block font-semibold">Grand Total</span>
                        <span className="font-mono text-sm font-bold text-[#24213A] tabular-nums truncate block">{calculations.formatted.grandTotal}</span>
                      </div>

                      <div className="pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E8E6F2] min-w-0">
                        <span className="text-[#24213A] text-[11px] block font-semibold">Amount Paid</span>
                        <span className="font-mono text-sm font-bold text-[#059669] tabular-nums truncate block">{calculations.formatted.amountPaid}</span>
                      </div>

                      <div className="pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E8E6F2] min-w-0">
                        <span className="text-[#24213A] text-[11px] block font-semibold">Balance Due</span>
                        <span className={cn(
                          "font-mono text-sm font-bold tabular-nums truncate block",
                          calculations.balanceDue <= 0 ? "text-[#059669]" : "text-[#D97706]"
                        )}>
                          {calculations.formatted.balanceDue}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION G: Additional Information */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#77758F] flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#5146D8]" />
                        <span>Additional Information</span>
                      </h3>
                      <span className="text-[11px] text-[#059669] font-medium bg-[#ECFDF5] px-2 py-0.5 rounded-full border border-[#A7F3D0]">Always Editable</span>
                    </div>

                    <div className={cn(
                      showPreview ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"
                    )}>
                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                          Folio remarks & internal notes
                        </label>
                        <textarea
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. Complimentary airport pickup arranged, early arrival..."
                          className="w-full bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-xl p-2.5 text-xs text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8]/20 resize-none transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                          House rules & stay guidelines
                        </label>
                        <textarea
                          rows={3}
                          value={houseRules}
                          onChange={(e) => setHouseRules(e.target.value)}
                          placeholder="e.g. Check-out by 11:00 AM, quiet hours after 10:00 PM..."
                          className="w-full bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-xl p-2.5 text-xs text-[#24213A] placeholder:text-[#77758F]/60 focus:outline-none focus:border-[#5146D8] focus:ring-1 focus:ring-[#5146D8]/20 resize-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* ─── TAB 2: PAYMENT LEDGER & TRANSACTIONS ───────────────────────── */}
              {activeTab === "payments" && (
                <div className="space-y-6">
                  {/* Status Banners */}
                  {paymentError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{paymentError}</span>
                    </div>
                  )}
                  {paymentSuccess && (
                    <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center gap-2.5 text-xs text-[#059669]">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[#059669]" />
                      <span>{paymentSuccess}</span>
                    </div>
                  )}

                  {/* Payment Recording Form */}
                  <div className="bg-white border border-[#E8E6F2] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#E8E6F2] pb-3">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#24213A] flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-[#059669]" />
                          <span>Record Payment Transaction</span>
                        </h3>
                        <p className="text-xs text-[#77758F] mt-0.5">Append-only immutable transaction entry.</p>
                      </div>

                      {calculations.balanceDue > 0 && (
                        <button
                          type="button"
                          onClick={handleQuickFillDue}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#F0EEFF] hover:bg-[#E8E4FF] text-[#5146D8] border border-[#E8E6F2] transition-colors cursor-pointer"
                        >
                          Fill Due: {calculations.formatted.balanceDue}
                        </button>
                      )}
                    </div>

                    {!existingInvoice ? (
                      <div className="p-3 bg-[#F6F5FC] border border-[#E8E6F2] rounded-xl text-xs text-[#77758F]">
                        Please save this invoice before recording ledger transactions.
                      </div>
                    ) : calculations.balanceDue <= 0 ? (
                      <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl flex items-center gap-2 text-xs text-[#059669]">
                        <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                        <span>This folio is settled in full. No outstanding balance remains.</span>
                      </div>
                    ) : (
                      <form onSubmit={handleRecordPayment} className="space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                              Payment Amount (₹) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={calculations.balanceDue}
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              placeholder="e.g. 1500.00"
                              className={cn(inputBase, inputActive, "font-mono tabular-nums font-semibold")}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                              Payment Method *
                            </label>
                            <select
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                              className="w-full h-9 bg-white border border-[#E8E6F2] hover:border-[#5146D8]/40 rounded-lg px-2.5 text-xs text-[#24213A] focus:outline-none focus:border-[#5146D8] transition-colors"
                            >
                              <option value="upi">UPI (GPay / PhonePe / QR)</option>
                              <option value="cash">Direct Cash</option>
                              <option value="card">Card Terminal</option>
                              <option value="net_banking">Bank NEFT / RTGS</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                              Transaction Reference
                            </label>
                            <input
                              type="text"
                              value={paymentRef}
                              onChange={(e) => setPaymentRef(e.target.value)}
                              placeholder="UTR / Auth code / receipt #"
                              className={cn(inputBase, inputActive, "font-mono")}
                            />
                          </div>

                          <div>
                            <label className="text-xs font-medium text-[#24213A] mb-1.5 block">
                              Audit Notes
                            </label>
                            <input
                              type="text"
                              value={paymentNotes}
                              onChange={(e) => setPaymentNotes(e.target.value)}
                              placeholder="e.g. Advance paid at check-in"
                              className={cn(inputBase, inputActive)}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="submit"
                            disabled={isRecordingPayment || !paymentAmount}
                            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#059669] hover:bg-[#047857] text-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm shadow-[#059669]/20"
                          >
                            {isRecordingPayment ? "Recording Payment..." : "Record Payment"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Payment History */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#77758F]">
                      Payment Ledger History ({localPayments.length})
                    </h4>

                    {localPayments.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#77758F] bg-white rounded-xl border border-[#E8E6F2]">
                        No payments recorded for this folio yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {localPayments.map((p) => (
                          <div 
                            key={p.id}
                            className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-[#E8E6F2] text-xs hover:border-[#5146D8]/30 transition-colors"
                          >
                            <div>
                              <div className="font-semibold text-[#24213A]">
                                ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} via {p.payment_method?.toUpperCase()}
                              </div>
                              <div className="text-[11px] text-[#77758F] mt-0.5">
                                {p.created_at ? formatISTCompactDate(p.created_at) : "Confirmed"} 
                                {p.transaction_ref ? ` • Ref: ${p.transaction_ref}` : ""}
                                {p.notes ? ` • ${p.notes}` : ""}
                              </div>
                            </div>

                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                              CONFIRMED
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          </div>

          {/* RIGHT PANEL: Live Invoice Document Preview */}
          {showPreview && (
            <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 bg-[#F6F5FC] overflow-y-auto hms-editor-scrollbar p-6 lg:p-8 flex-col items-center justify-start border-l border-[#E8E6F2] min-h-0 pb-16">
              {/* Header above preview document */}
              <div className="w-full max-w-[800px] mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  <span className="text-xs font-semibold text-[#24213A]">Live Document Preview</span>
                  <span className="text-[11px] text-[#77758F] hidden sm:inline">• Synced</span>
                </div>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="text-xs text-[#77758F] hover:text-[#5146D8] flex items-center gap-1 font-medium cursor-pointer transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
              </div>

              {/* Physical A4 Paper Sheet Preview Container */}
              <div id="printable-live-invoice" className="w-full max-w-[800px] shadow-xl rounded-sm overflow-hidden border border-[#E8E6F2] transition-all print:shadow-none print:border-none print:overflow-visible">
                <InvoicePDFView
                  invoice={liveInvoice}
                  homestay={currentHomestay}
                  className="scale-[0.98] sm:scale-100 origin-top print:scale-100 print:transform-none"
                />
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Discard Unsaved Changes Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[100060] flex items-center justify-center p-4 bg-[#24213A]/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white border border-[#E8E6F2] rounded-2xl p-5 shadow-2xl text-left space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 text-rose-500">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#24213A]">Discard unsaved changes?</h3>
                <p className="text-xs text-[#77758F] mt-1 leading-relaxed">
                  You have uncommitted modifications. Closing now will permanently discard any changes made to this folio.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E8E6F2]">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#77758F] hover:text-[#24213A] hover:bg-[#F6F5FC] border border-[#E8E6F2] transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer active:scale-95"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
