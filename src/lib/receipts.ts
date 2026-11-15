import { PaymentStage } from "./types";

export function getStageBadgeDetails(stage: PaymentStage) {
  switch (stage) {
    case 'advance':
      return {
        label: "Advance Payment",
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        description: "Pre-arrival reservation deposit"
      };
    case 'partial':
      return {
        label: "Partial Payment",
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
        description: "In-stay interim settlement"
      };
    case 'final':
      return {
        label: "Final Settlement",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        description: "Final checkout settlement"
      };
    case 'refund':
      return {
        label: "Guest Refund",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        description: "Disbursement returned to guest"
      };
    case 'reversal':
      return {
        label: "Payment Reversal",
        badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
        description: "Audit ledger correction"
      };
    default:
      return {
        label: "Payment",
        badgeClass: "bg-gray-50 text-gray-700 border-gray-200",
        description: "Transaction entry"
      };
  }
}

export function formatMethodLabel(method: string): string {
  switch (method?.toLowerCase()) {
    case 'upi': return 'UPI / QR Code';
    case 'cash': return 'Direct Cash';
    case 'card': return 'Credit / Debit Card';
    case 'bank_transfer': return 'Bank Transfer (NEFT/IMPS)';
    case 'ota_payout': return 'OTA / Travel Agent';
    default: return method?.toUpperCase() || 'Payment';
  }
}

