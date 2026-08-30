/**
 * Phone numbers are normalised to E.164 here, on the server, before they reach
 * Cognito - and Cognito's own copy is what the API later stores on the profile.
 * Normalising in exactly one place is what makes "+91XXXXXXXXXX" the single
 * shape a number is ever held in, from sign-up through to the database.
 */

/** Accepts 10 local digits, or the same number already carrying +91 / 91 / 0. */
export function toE164India(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "")
  const local = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits
  // Indian mobile numbers are 10 digits and never start below 6.
  if (!/^[6-9]\d{9}$/.test(local)) return null
  return `+91${local}`
}
