/**
 * The profile lookup every signed-in screen starts from.
 *
 * Phase 1 has exactly one API answer that is not a failure: the JWT authorizer
 * accepted the token, the Lambda's ownership guard ran, and it reported that
 * this subject owns no `driver_profiles` row yet. That is "authenticated but not
 * yet registered", and it belongs on the profile screen rather than on an error
 * path.
 *
 * The narrowing lives here rather than in `callApi`, which keeps throwing on
 * every non-2xx. A 401, a bare `403 Forbidden`, a 500 and a network error must
 * all stay loud - treating any of them as "no profile" would send a driver whose
 * session merely expired into a second registration.
 */

export interface DriverProfileSummary {
  id: string
  name: string | null
}

export type ProfileQuery = () => Promise<{ data: DriverProfileSummary | null }>

/** The exact shape `lib/supabase.ts` throws: `HTTP <status>: <raw body>`. */
const HTTP_ERROR = /^HTTP (\d{3}): ([\s\S]*)$/

/** `requireDriverId` in lambda/guard.ts - the only message this maps to null. */
const NO_PROFILE = "No driver profile"

/**
 * True only for a 403 whose body is the guard's own "No driver profile".
 * Both halves are required: the status alone cannot tell a missing profile row
 * from a table the policy refuses outright, and both arrive as 403.
 */
export function isNoDriverProfileError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const match = HTTP_ERROR.exec(err.message)
  if (!match || match[1] !== "403") return false
  try {
    return (JSON.parse(match[2]) as { error?: unknown }).error === NO_PROFILE
  } catch {
    return false // a 403 with a non-JSON body is not the guard's answer
  }
}

/** The caller's profile, or null when they are authenticated without one. */
export async function withNoProfileAsNull(
  query: ProfileQuery
): Promise<DriverProfileSummary | null> {
  try {
    const { data } = await query()
    return data ?? null
  } catch (err) {
    if (isNoDriverProfileError(err)) return null
    throw err
  }
}
