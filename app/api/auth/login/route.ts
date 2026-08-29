import { NextRequest, NextResponse } from "next/server"
import { CognitoError, isConfigured, signIn } from "@/lib/cognito"
import { toE164India } from "@/lib/phone"
import { writeSession } from "@/lib/session"

/**
 * Sign in with phone number and password.
 *
 * The password is exchanged for tokens here rather than in the browser so the
 * refresh token can be stored HttpOnly. Only the short-lived access token goes
 * back to the page.
 */
export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 })
  }

  const { phone, password } = (await request.json().catch(() => ({}))) as {
    phone?: string
    password?: string
  }

  const phoneNumber = toE164India(phone ?? "")
  if (!phoneNumber || !password) {
    return NextResponse.json({ error: "Phone number and password are required" }, { status: 400 })
  }

  try {
    const tokens = await signIn(phoneNumber, password)
    await writeSession({ rt: tokens.refreshToken, u: tokens.username })
    return NextResponse.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn })
  } catch (e) {
    const error = e as CognitoError
    return NextResponse.json(
      { error: error.message ?? "Authentication failed" },
      { status: error.status ?? 500 }
    )
  }
}
