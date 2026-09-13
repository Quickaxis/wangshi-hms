export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns a new Date object representing the exact current moment.
 */
export function getCurrentISTDate(): Date {
  return new Date();
}

/**
 * Given any Date, returns a strictly formatted string in IST.
 */
function formatInIST(date: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      ...options,
      timeZone: IST_TIMEZONE,
    }).format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return date.toLocaleString();
  }
}

/**
 * Sunday, 13 September 2026
 */
export function formatISTFullDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInIST(d, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * 13 Sep 2026
 */
export function formatISTCompactDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInIST(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * 13 Sep
 */
export function formatISTVeryCompactDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInIST(d, {
    day: "numeric",
    month: "short",
  });
}

/**
 * 12:42 PM
 */
export function formatISTTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  
  // Intl format returns strings like "12:42 pm" or "12:42 PM" depending on browser. 
  // Let's explicitly uppercase the AM/PM for consistency.
  const timeStr = formatInIST(d, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return timeStr.toUpperCase();
}

/**
 * 13 Sep 2026 · 12:42 PM
 */
export function formatISTDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dateStr = formatISTCompactDate(d);
  const timeStr = formatISTTime(d);
  return `${dateStr} · ${timeStr}`;
}

/**
 * yyyy-MM-dd (for internal state like selectedDate)
 */
export function getISTDateString(date?: Date | string): string {
  const d = date ? (typeof date === "string" ? new Date(date) : date) : new Date();
  
  // To reliably get yyyy-MM-dd, we can use formatToParts or specifically request numeric fields
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // en-CA naturally outputs yyyy-mm-dd
  return formatter.format(d);
}

/**
 * Combine a date string (yyyy-MM-dd) and a time string (HH:mm) into a full ISO string.
 * This represents the exact moment in IST.
 */
export function combineDateAndTime(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00+05:30`;
}

/**
 * Parse a Date/string back to a 24-hour "HH:mm" format in IST for HTML time inputs.
 */
export function getISTTimeInputString(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInIST(d, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
