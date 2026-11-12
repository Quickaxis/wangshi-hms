import * as XLSX from "xlsx";
import { formatISTCompactDate } from "./dateUtils";

export interface GuestRegisterExportRow {
  guest_name: string;
  phone: string;
  booking_id: string;
  room_name: string;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  status: string;
  source: string;
}

export interface GuestRegisterBookingItem {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  total_amount: number;
  created_at: string;
  room_name: string;
  partner_name: string;
  guests: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    is_primary: boolean;
  }>;
}

/**
 * Transforms guest bookings into flat export rows strictly omitting private documents and sensitive data.
 */
export function buildGuestRegisterRows(bookings: GuestRegisterBookingItem[]): GuestRegisterExportRow[] {
  const rows: GuestRegisterExportRow[] = [];

  for (const b of bookings) {
    const guestsList = b.guests && b.guests.length > 0 ? b.guests : [{
      id: "unknown",
      name: "Guest",
      phone: null,
      email: null,
      is_primary: true
    }];

    for (const g of guestsList) {
      rows.push({
        guest_name: g.name + (g.is_primary ? " (Primary)" : ""),
        phone: g.phone || "N/A",
        booking_id: b.id.slice(0, 8).toUpperCase(),
        room_name: b.room_name || "N/A",
        check_in: formatISTCompactDate(b.check_in),
        check_out: formatISTCompactDate(b.check_out),
        number_of_guests: b.guests.length || 1,
        status: b.status.replace("_", " ").toUpperCase(),
        source: b.partner_name || "Reception",
      });
    }
  }

  return rows;
}

/**
 * Generates and downloads a real .xlsx Excel file in the browser.
 */
export function exportGuestRegisterToExcel(
  bookings: GuestRegisterBookingItem[],
  options: {
    title: string;
    homestayName: string;
    sheetName?: string;
    fileName?: string;
  }
) {
  const flatRows = buildGuestRegisterRows(bookings);

  // Format headers
  const headers = [
    "Guest Name",
    "Phone Number",
    "Booking Reference",
    "Room Name",
    "Check-in Date",
    "Check-out Date",
    "Guests Count",
    "Booking Status",
    "Source / Staff"
  ];

  // Convert objects to rows
  const dataRows = flatRows.map(r => [
    r.guest_name,
    r.phone,
    r.booking_id,
    r.room_name,
    r.check_in,
    r.check_out,
    r.number_of_guests,
    r.status,
    r.source
  ]);

  // Add Metadata Header Row
  const metaHeader = [
    [`${options.homestayName.toUpperCase()} — ${options.title.toUpperCase()}`],
    [`Generated: ${new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })} | Total Records: ${flatRows.length}`],
    [] // Blank line
  ];

  const fullSheetData = [...metaHeader, headers, ...dataRows];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);

  // Column width calculations
  const colWidths = [
    { wch: 25 }, // Guest Name
    { wch: 16 }, // Phone
    { wch: 20 }, // Booking Ref
    { wch: 22 }, // Room
    { wch: 15 }, // Check-in
    { wch: 15 }, // Check-out
    { wch: 14 }, // Guests Count
    { wch: 16 }, // Status
    { wch: 18 }  // Source
  ];
  ws["!cols"] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  const safeSheetName = (options.sheetName || "Guest_Register").replace(/[\\\/?*\[\]:]/g, "_").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  // Write and download
  const defaultFileName = `${(options.homestayName || "HMS").replace(/\s+/g, "_")}_${safeSheetName}.xlsx`;
  XLSX.writeFile(wb, options.fileName || defaultFileName);
}

