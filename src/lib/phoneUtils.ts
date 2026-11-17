/**
 * Utility functions for phone number handling and direct dialing
 */

export interface CallInfo {
  telHref: string;
  displayPhone: string;
  isValid: boolean;
}

export function formatPhoneNumberForCall(phone?: string | null): CallInfo | null {
  if (!phone || typeof phone !== "string") return null;
  const trimmed = phone.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed.toLowerCase() === "none") {
    return null;
  }

  // Extract all numeric digits
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return null;

  let dialNumber = digits;
  let formattedDisplay = trimmed;

  if (digits.length === 10) {
    // Standard 10-digit Indian number without country code
    dialNumber = `+91${digits}`;
    formattedDisplay = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // 11 digits starting with leading 0 (e.g. 09876543210)
    const rest = digits.slice(1);
    dialNumber = `+91${rest}`;
    formattedDisplay = `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    // 12 digits with 91 prefix
    dialNumber = `+${digits}`;
    const rest = digits.slice(2);
    formattedDisplay = `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`;
  } else if (trimmed.startsWith("+")) {
    // International number with explicit +
    dialNumber = `+${digits}`;
    formattedDisplay = trimmed;
  } else {
    // Generic fallback
    dialNumber = `+${digits}`;
    formattedDisplay = trimmed;
  }

  return {
    telHref: `tel:${dialNumber}`,
    displayPhone: formattedDisplay,
    isValid: true,
  };
}

