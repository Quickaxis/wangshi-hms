export type BookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type RoomStatus = "available" | "booked";

export interface Homestay {
  id: string;
  name: string;
  slug?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Partner {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: string | null;
  homestay_id?: string | null;
  is_active: boolean | null;
  created_at: string;
  homestay?: Homestay;
}

export interface DbRoom {
  id: string;
  homestay_id: string;
  room_number: string;
  name: string;
  description: string | null;
  bathroom_type: string;
  max_guests: number;
  nightly_rate: number;
  breakfast_included: boolean;
  breakfast_details: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  homestay?: Homestay;
}

export interface DbGuest {
  id: string;
  booking_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBooking {
  id: string;
  room_id: string;
  partner_id: string;
  homestay_id: string;
  check_in: string; // YYYY-MM-DD
  check_in_time?: string; // DEPRECATED
  check_out: string; // YYYY-MM-DD
  check_out_time?: string; // DEPRECATED
  status: BookingStatus;
  number_of_guests: number;
  nightly_rate: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  rooms?: DbRoom;
  partners?: Partner;
  guests?: DbGuest[];
  homestay?: Homestay;
}

export interface BookingGuest {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
}

export interface CurrentBookingDetails {
  id: string;
  guests: BookingGuest[];
  guestPhone?: string;
  checkIn: string; // YYYY-MM-DD
  checkInTime?: string; // DEPRECATED
  checkOut: string; // YYYY-MM-DD
  checkOutTime?: string; // DEPRECATED
  createdAt?: string;
  bookedBy: string; // Partner Name
  partnerId?: string;
  bookingAmount: number;
  status: BookingStatus;
  notes?: string;
}

export interface Room {
  id: string;
  homestay_id?: string;
  room_number?: string;
  name: string;
  description?: string;
  bathroomInfo: string;
  bathroom_type?: string;
  maxCapacity: number;
  max_guests?: number;
  pricePerNight: number;
  nightly_rate?: number;
  breakfastInfo: string;
  breakfast_included?: boolean;
  breakfast_details?: string;
  is_active?: boolean;
  status: RoomStatus;
  imageUrl?: string;
  currentBooking?: CurrentBookingDetails;
}

export type BookingRequestStatus = "pending" | "approved" | "rejected";

export interface DbBookingRequest {
  id: string;
  homestay_id: string;
  room_id: string | null;
  booking_id?: string | null;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  number_of_guests: number;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  notes: string | null;
  estimated_total: number;
  payment_method?: string;
  status: BookingRequestStatus;
  created_at: string;
  updated_at: string;
  rooms?: {
    id: string;
    room_number?: string;
    name: string;
    nightly_rate: number;
  } | null;
  homestay?: Homestay;
}

export type PaymentType = 'payment' | 'refund' | 'reversal';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'ota_payout';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overpaid' | 'refunded';

export interface DbPayment {
  id: string;
  homestay_id: string;
  booking_id: string;
  amount: number | string; // NUMERIC(12,2) from Postgres
  payment_type: PaymentType;
  payment_method: PaymentMethod;
  parent_payment_id?: string | null;
  transaction_ref?: string | null;
  notes?: string | null;
  recorded_by: string;
  created_at: string;
  partners?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface BookingFinancialSummary {
  bookingId: string;
  totalContracted: string;
  grossCollected: string;
  totalReversed: string;
  netCollected: string;
  totalRefunded: string;
  netPaid: string;
  balanceDue: string;
  paymentStatus: PaymentStatus;
  formatted: {
    totalContracted: string;
    grossCollected: string;
    totalReversed: string;
    netCollected: string;
    totalRefunded: string;
    netPaid: string;
    balanceDue: string;
  };
  payments: DbPayment[];
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'unpaid' | 'overpaid' | 'cancelled';
export type InvoiceItemCategory = 
  | 'room' 
  | 'food_beverage' 
  | 'laundry' 
  | 'extra_bed' 
  | 'additional_nights' 
  | 'custom' 
  | 'discount';

export interface DbInvoiceItem {
  id: string;
  invoice_id: string;
  homestay_id: string;
  category: InvoiceItemCategory;
  description: string;
  stay_period?: string | null;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
  created_at: string;
  is_complimentary?: boolean;
}

export interface DbInvoice {
  id: string;
  homestay_id: string;
  booking_id: string;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  status: InvoiceStatus;
  guest_name: string;
  guest_phone?: string | null;
  guest_email?: string | null;
  guest_address?: string | null;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  room_id?: string | null;
  room_name?: string | null;
  subtotal: number;
  tax_rate: number; // percentage e.g. 0, 5, 12, 18
  tax_amount: number;
  discount_amount: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  notes?: string | null;
  house_rules?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: DbInvoiceItem[];
  bookings?: DbBooking;
  homestay?: Homestay;
  payments?: DbPayment[];
}

export interface CreateInvoiceItemInput {
  id?: string;
  category: InvoiceItemCategory;
  description: string;
  stay_period?: string | null;
  quantity: number;
  rate: number;
  amount: number;
  sort_order?: number;
  is_complimentary?: boolean;
}

export interface CreateInvoiceInput {
  bookingId: string;
  homestayId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  status?: InvoiceStatus;
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guestAddress?: string | null;
  checkIn: string;
  checkOut: string;
  roomId?: string | null;
  roomName?: string | null;
  items: CreateInvoiceItemInput[];
  taxRate?: number;
  discountAmount?: number;
  notes?: string | null;
  houseRules?: string | null;
  allowDuplicate?: boolean; // For explicit supplementary billing
}

export interface UpdateInvoiceInput {
  id: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  status?: InvoiceStatus;
  guestName?: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guestAddress?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  checkIn?: string;
  checkOut?: string;
  items?: CreateInvoiceItemInput[] | null;
  taxRate?: number;
  discountAmount?: number;
  notes?: string | null;
  houseRules?: string | null;
}
