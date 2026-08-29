import { NextRequest, NextResponse } from "next/server"

/**
 * Routing convenience only - NOT a security boundary.
 *
 * This used to gate pages on a `rakashi-auth=1` cookie that the page itself set
 * with document.cookie, so anyone could grant themselves access with one line in
 * the console. It never protected data either: every record comes from the API,
 * which is where authorization actually belongs and now lives (Cognito JWT
 * authorizer plus the ownership guard in the Lambda).
 *
 * All this does is spare a signed-out visitor a flash of an empty dashboard. The
 * cookie it looks for is HttpOnly and set server-side, and its mere presence is
 * treated as a hint - never as proof. Forging it gets you a page that renders and
 * then fails every API call it makes.
 */

const PROTECTED_PATHS = [
  "/dashboard",
  "/ocr",
  "/job",
  "/tracking",
  "/arrival",
  "/completion",
  "/set-destination",
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path))
  if (!isProtected) return NextResponse.next()

  if (!request.cookies.get("rakashi_session")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ocr/:path*",
    "/job/:path*",
    "/tracking/:path*",
    "/arrival/:path*",
    "/completion/:path*",
    "/set-destination/:path*",
  ],
}
