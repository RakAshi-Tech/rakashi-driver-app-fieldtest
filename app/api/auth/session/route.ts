import { NextResponse } from "next/server"
import { isConfigured, refresh } from "@/lib/cognito"
import { clearSession, readSession, writeSession } from "@/lib/session"

/**
 * Exchange the HttpOnly refresh cookie for a fresh access token.
 *
 * This is what makes the second visit silent: the page calls this on load, and
 * if the cookie is still valid the driver lands on the dashboard without typing
 * anything. A 401 here simply means "show the login screen".
 */
export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 })
  }

  const session = await readSession()
  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 401 })
  }

  try {
    const tokens = await refresh(session.rt, session.u)
    // Roll the cookie forward so an active driver is not signed out on the
    // thirtieth day just because the original cookie is expiring.
    await writeSession({ rt: tokens.refreshToken || session.rt, u: session.u })
    return NextResponse.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn })
  } catch {
    // Revoked, expired, or issued by a different pool - all mean "sign in again".
    await clearSession()
    return NextResponse.json({ error: "Session expired" }, { status: 401 })
  }
}
