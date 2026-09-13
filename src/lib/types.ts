export type BookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type RoomStatus = "available" | "booked";

export interface Partner {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
}

export interface DbRoom {
  id: string;
  room_number: string;
  name: string;
  description: string | null;
  bathroom_type: string;
  max_guests: number;
  nightly_rate: number;
  breakfast_included: boolean;
  breakfast_details: string | null;
  created_at: string;
  updated_at: string;
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
  status: RoomStatus;
  imageUrl?: string;
  currentBooking?: CurrentBookingDetails;
}
