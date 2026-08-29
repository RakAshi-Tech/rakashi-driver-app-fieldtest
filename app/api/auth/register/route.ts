import { NextRequest, NextResponse } from "next/server"
import { CognitoError, isConfigured, signIn, signUp } from "@/lib/cognito"
import { toE164India } from "@/lib/phone"
import { writeSession } from "@/lib/session"

/**
 * Create an account, then sign straight in so the driver never has to enter the
 * same credentials twice.
 *
 * No profile row is written here. The browser creates it through the normal API
 * once it holds a token, which keeps driver_profiles behind the ownership guard
 * instead of giving this route a second, unguarded write path.
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
  if (!phoneNumber) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  try {
    await signUp(phoneNumber, password)
    const tokens = await signIn(phoneNumber, password)
    await writeSession({ rt: tokens.refreshToken, u: tokens.username })
    return NextResponse.json({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn })
  } catch (e) {
    const error = e as CognitoError
    return NextResponse.json(
      { error: error.message ?? "Registration failed" },
      { status: error.status ?? 500 }
    )
  }
}
