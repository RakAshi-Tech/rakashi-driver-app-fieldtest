/**
 * Refresh-token cookie.
 *
 * The refresh token is the long-lived credential that keeps a driver signed in
 * across visits, so it is kept out of JavaScript entirely: HttpOnly means an XSS
 * bug cannot read it, and the browser attaches it only to our own route handlers.
 *
 * The short-lived access token is deliberately NOT stored here. It is returned in
 * the response body and held in memory by the page, so closing the tab discards it.
 */

import { cookies } from "next/headers"

const COOKIE_NAME = "rakashi_session"
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export interface SessionCookie {
  /** Cognito refresh token. */
  rt: string
  /** Cognito internal username, required to compute the refresh secret hash. */
  u: string
}

export async function writeSession(session: SessionCookie): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    // Localhost dev is plain http, where a Secure cookie would never be sent.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function readSession(): Promise<SessionCookie | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SessionCookie
    return parsed.rt && parsed.u ? parsed : null
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
  // The pre-Cognito flag was settable from the page with document.cookie, so it
  // proved nothing about who was calling. Removing it here clears it from
  // browsers that still carry one.
  store.delete("rakashi-auth")
}
