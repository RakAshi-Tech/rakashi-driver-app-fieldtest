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
  /**
   * Phone number as asserted by Cognito via the pre-token trigger, in E.164, or
   * null if the claim was missing or malformed. This is the only value ever
   * written to driver_profiles.phone_number.
   */
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

/**
 * E.164, which is the only shape a phone number is ever stored in.
 *
 * Cognito validates `phone_number` as E.164 at sign-up and the pre-token trigger
 * copies that attribute verbatim, so a well-formed claim already satisfies this.
 * Checking it here is what makes the invariant explicit rather than assumed: the
 * value goes straight into driver_profiles.phone_number, and one malformed write
 * would be enough to make the column stop meaning one thing.
 */
const E164 = /^\+[1-9]\d{7,14}$/

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

/** sub -> driverId, valid for the life of a warm container. */
const driverIdCache = new Map<string, { driverId: string; at: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export async function resolveCaller(db: Pool, claims: JwtClaims): Promise<Caller> {
  const sub = claims.sub as string
  const claimed = claims.phone_number
  const phoneNumber =
    typeof claimed === 'string' && E164.test(claimed) ? claimed : null

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

  // This Cognito user has no profile yet, so they are on their way to creating
  // one. There is deliberately no path here that adopts an existing row by phone
  // number: Phase 1 does not verify phone ownership (the pre-signup trigger sets
  // autoConfirmUser but not autoVerifyPhone), so anyone able to register a number
  // could otherwise take over whatever profile happened to carry it. A profile
  // is only ever created by its own owner, keyed on the cognito_sub in the token.
  //
  // phone_number carries a UNIQUE constraint, so a number already sitting on any
  // other row - linked to another account or linked to nothing - would fail the
  // upsert. Saying so plainly beats surfacing a constraint violation as a 500.
  // `IS DISTINCT FROM` is what makes an unlinked row count: NULL is not this
  // caller's sub either, and it occupies the number just as effectively.
  if (phoneNumber) {
    const taken = await db.query(
      `SELECT 1 FROM driver_profiles
        WHERE phone_number = $1 AND cognito_sub IS DISTINCT FROM $2
        LIMIT 1`,
      [phoneNumber, sub]
    )
    if (taken.rowCount) {
      throw new AuthError(403, 'Phone number already belongs to another profile')
    }
  }

  return { sub, phoneNumber, driverId: null }
}

/** Drop a cached mapping after a profile is created for that subject. */
export function forgetCachedDriver(sub: string): void {
  driverIdCache.delete(sub)
}
