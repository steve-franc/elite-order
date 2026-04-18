/**
 * WhatsApp click-to-chat helpers.
 * Builds wa.me URLs that open WhatsApp with a pre-filled message
 * — no backend integration required.
 */

/** Strip everything that is not a digit, drop a leading +. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/[^\d]/g, "");
}

/** Build a wa.me URL with a pre-filled message. Returns "" if phone is missing/invalid. */
export function buildWaLink(phone: string | null | undefined, message: string): string {
  const digits = normalizePhone(phone);
  if (digits.length < 7) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Open the WhatsApp chat in a new tab. */
export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const url = buildWaLink(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
