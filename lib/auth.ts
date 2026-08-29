"use client"

/**
 * Browser-side session state.
 *
 * The access token lives in a module variable and nowhere else - not
 * localStorage, not a readable cookie - so it disappears when the tab closes and
 * cannot be lifted out of storage by injected script. Continuity across visits
 * comes from the HttpOnly refresh cookie, which only the route handlers can read.
 */

/**
 * Phase 1 authenticates with a password because SMS to Indian numbers still
 * depends on DLT registration. The SMS_OTP path is designed for and reachable
 * from the same Cognito pool: switching this constant, enabling SMS_OTP as a
 * first auth factor on the pool, and rendering the existing OTP screen is the
 * whole change.
 */
export const AUTH_MODE: "PASSWORD" | "SMS_OTP" = "PASSWORD"

let accessToken: string | null = null
let expiresAt = 0
/** De-duplicates refreshes when several API calls miss the token at once. */
let inFlight: Promise<string | null> | null = null

/** Refresh slightly early so a request never travels with a just-expired token. */
const EXPIRY_MARGIN_MS = 60_000

function store(token: string, expiresIn: number): string {
  accessToken = token
  expiresAt = Date.now() + expiresIn * 1000
  return token
}

function forget(): void {
  accessToken = null
  expiresAt = 0
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Same-origin, but explicit so the session cookie always rides along.
    credentials: "same-origin",
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return data.error ?? fallback
}

/** Swap the refresh cookie for an access token. Returns null when signed out. */
async function refreshFromCookie(): Promise<string | null> {
  try {
    const res = await post("/api/auth/session")
    if (!res.ok) {
      forget()
      return null
    }
    const data = (await res.json()) as { accessToken: string; expiresIn: number }
    return store(data.accessToken, data.expiresIn)
  } catch {
    forget()
    return null
  }
}

/**
 * Current access token, refreshing when it is missing or about to expire.
 * Returns null when there is no usable session.
 */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < expiresAt - EXPIRY_MARGIN_MS) return accessToken
  if (!inFlight) {
    inFlight = refreshFromCookie().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

/** Force a refresh after the API rejects a token as stale. */
export async function renewAccessToken(): Promise<string | null> {
  forget()
  return getAccessToken()
}

/** True when a valid session already exists - the silent second-visit path. */
export async function hasSession(): Promise<boolean> {
  return (await getAccessToken()) !== null
}

export async function login(phone: string, password: string): Promise<void> {
  const res = await post("/api/auth/login", { phone, password })
  if (!res.ok) throw new Error(await readError(res, "Sign in failed"))
  const data = (await res.json()) as { accessToken: string; expiresIn: number }
  store(data.accessToken, data.expiresIn)
}

export async function register(phone: string, password: string): Promise<void> {
  const res = await post("/api/auth/register", { phone, password })
  if (!res.ok) throw new Error(await readError(res, "Registration failed"))
  const data = (await res.json()) as { accessToken: string; expiresIn: number }
  store(data.accessToken, data.expiresIn)
}

export async function logout(): Promise<void> {
  forget()
  try {
    await post("/api/auth/logout")
  } catch {
    // The in-memory token is already gone, so the user is signed out locally
    // regardless of whether the revoke call reached Cognito.
  }
}
