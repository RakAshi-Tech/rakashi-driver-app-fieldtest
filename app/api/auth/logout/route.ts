import { NextResponse } from "next/server"
import { revoke } from "@/lib/cognito"
import { clearSession, readSession } from "@/lib/session"

/** Revoke the refresh token server-side, then drop the cookie. */
export async function POST() {
  const session = await readSession()
  if (session) await revoke(session.rt)
  await clearSession()
  return NextResponse.json({ ok: true })
}
