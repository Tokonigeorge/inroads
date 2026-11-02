/** wa.me wants the number as bare digits (country code first, no "+"). Kept apart from normalise so the browser doesn't load the phone library just for this. */
export function whatsappDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}
