/**
 * Phone numbers are normalised to E.164 here, on the server, before they reach
 * Cognito - and Cognito's own copy is what the API later stores on the profile.
 * Normalising in exactly one place is what makes "+91XXXXXXXXXX" the single
 * shape a number is ever held in, from sign-up through to the database.
 */

/**
 * The one number Preview deployments accept outside the Indian mobile rules.
 *
 * Field testing needs an account nobody has to own an Indian SIM to reach, and
 * Phase 1 confirms sign-ups without verifying the number, so the exception costs
 * nothing there. It is deliberately a single literal rather than a range or a
 * prefix: widening it is what would let an unreachable number into Production.
 */
const PREVIEW_TEST_LOCAL = "1234567890"

/**
 * True only on a Vercel Preview deployment.
 *
 * `VERCEL_ENV` is set by Vercel itself and is "production" on the Production
 * deployment and absent on a local build, so both fall through to the normal
 * rules. Read at call time rather than at module load so the value cannot be
 * baked in by whichever environment happened to build the bundle.
 */
function isPreview(): boolean {
  return process.env.VERCEL_ENV === "preview"
}

/** Accepts 10 local digits, or the same number already carrying +91 / 91 / 0. */
export function toE164India(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "")
  const local = digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits
  // The Preview test number, and nothing else, skips the mobile-range check.
  if (isPreview() && local === PREVIEW_TEST_LOCAL) return `+91${local}`
  // Indian mobile numbers are 10 digits and never start below 6.
  if (!/^[6-9]\d{9}$/.test(local)) return null
  return `+91${local}`
}
