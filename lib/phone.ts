/**
 * Phone numbers reach Cognito in E.164, and the same string is what links a
 * Cognito user to their existing driver_profiles row - the two existing profiles
 * are both stored as +91XXXXXXXXXX. Normalising in one place keeps those in step.
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
