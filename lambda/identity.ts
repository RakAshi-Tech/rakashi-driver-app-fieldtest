/**
 * Turns a validated JWT into the driver row it is allowed to act as.
 *
 * API Gateway has already checked the signature, expiry, issuer and audience by
 * the time this runs, so the claims can be trusted - but only the claims. The
 * request body is attacker-controlled and is never consulted here.
 */

import type { Pool } from 'pg'

export interface JwtClaims {
  sub?: string
  token_use?: string
  phone_number?: string
  [key: string]: unknown
}

export interface Caller {
  /** Cognito subject. Immutable and never reused - the root of trust. */
  sub: string
  /** Phone number as asserted by Cognito via the pre-token trigger. */
  phoneNumber: string | null
  /** driver_profiles.id, or null when this user has no profile row yet. */
  driverId: string | null
}

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
  }
}

/** Claiming is only needed until the pre-Cognito rows are linked. */
const ALLOW_PHONE_CLAIM = process.env.ALLOW_PHONE_CLAIM !== 'false'

interface AuthorizerContext {
  jwt?: { claims?: Record<string, unknown> }
}

export function readClaims(event: {
  requestContext?: { authorizer?: AuthorizerContext }
}): JwtClaims {
  const claims = event.requestContext?.authorizer?.jwt?.claims

  // Reaching the handler without claims means the route is not wired to the
  // authorizer. Fail closed rather than silently serving unauthenticated traffic.
  if (!claims || typeof claims !== 'object') {
    throw new AuthError(401, 'Unauthorized')
  }

  const parsed = claims as JwtClaims

  // API Gateway matches the audience against aud or client_id, which an id token
  // also satisfies. Pin the type so an id token cannot be swapped in for an
  // access token.
  if (parsed.token_use !== 'access') {
    throw new AuthError(401, 'Unauthorized')
  }

  if (!parsed.sub || typeof parsed.sub !== 'string') {
    throw new AuthError(401, 'Unauthorized')
  }

  return parsed
}

/**
 * The forms a pre-Cognito profile might hold the same number in.
 *
 * Cognito always hands us E.164 (+91XXXXXXXXXX), but the profiles that predate
 * it were written by a screen that stored whatever was typed, so a row may carry
 * the bare ten-digit local number, or 91/0 prefixes, instead. They are the same
 * person. Matching only the E.164 form leaves those drivers unlinked, and an
 * unlinked driver does not get an error - they get a second, empty profile, and
 * their deliveries, earnings and trust score stay stranded on the old row.
 *
 * A count-only probe of the two existing rows (no personal data read) put their
 * digits outside the +91[6-9]XXXXXXXXX range, so this is not hypothetical.
 *
 * Every variant is derived from the same ten digits, so two different numbers
 * can never produce an overlapping set, and the value still comes from the token
 * rather than from the request. The `cognito_sub IS NULL` condition on the claim
 * is unchanged and remains what stops a row being taken over.
 */
export function phoneVariants(e164: string): string[] {
  if (!e164.startsWith('+91')) return [e164]
  const local = e164.slice(3)
  return [e164, local, `91${local}`, `0${local}`]
}

/** sub -> driverId, valid for the life of a warm container. */
const driverIdCache = new Map<string, { driverId: string; at: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export async function resolveCaller(db: Pool, claims: JwtClaims): Promise<Caller> {
  const sub = claims.sub as string
  const phoneNumber =
    typeof claims.phone_number === 'string' ? claims.phone_number : null

  const cached = driverIdCache.get(sub)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { sub, phoneNumber, driverId: cached.driverId }
  }

  const bySub = await db.query<{ id: string }>(
    'SELECT id FROM driver_profiles WHERE cognito_sub = $1 LIMIT 1',
    [sub]
  )
  if (bySub.rows[0]) {
    const driverId = bySub.rows[0].id
    driverIdCache.set(sub, { driverId, at: Date.now() })
    return { sub, phoneNumber, driverId }
  }

  // No profile is linked to this Cognito user yet. Two possibilities: a driver
  // who predates Cognito and whose row is waiting to be claimed, or a genuinely
  // new signup that still has to create a profile.
  if (ALLOW_PHONE_CLAIM && phoneNumber) {
    // Conditional update: a row can only be claimed while it is unclaimed, so
    // two users racing for the same number cannot both win, and an already-linked
    // profile can never be taken over.
    const claimed = await db.query<{ id: string }>(
      `UPDATE driver_profiles
          SET cognito_sub = $1, updated_at = NOW()
        WHERE phone_number = ANY($2::text[]) AND cognito_sub IS NULL
      RETURNING id`,
      [sub, phoneVariants(phoneNumber)]
    )
    if (claimed.rows[0]) {
      const driverId = claimed.rows[0].id
      console.log('[auth] linked existing profile to cognito user')
      driverIdCache.set(sub, { driverId, at: Date.now() })
      return { sub, phoneNumber, driverId }
    }

    // The number exists but belongs to a different Cognito user. Refuse rather
    // than quietly handing out a second profile for the same phone.
    const taken = await db.query(
      `SELECT 1 FROM driver_profiles
        WHERE phone_number = ANY($1::text[])
          AND cognito_sub IS NOT NULL AND cognito_sub <> $2
        LIMIT 1`,
      [phoneVariants(phoneNumber), sub]
    )
    if (taken.rowCount) {
      throw new AuthError(403, 'Phone number is linked to another account')
    }
  }

  return { sub, phoneNumber, driverId: null }
}

/** Drop a cached mapping after a profile is created for that subject. */
export function forgetCachedDriver(sub: string): void {
  driverIdCache.delete(sub)
}
