import { NextRequest, NextResponse } from "next/server"

// Protected routes that require authentication
const PROTECTED_PATHS = [
  "/dashboard",
  "/ocr",
  "/job",
  "/tracking",
  "/arrival",
  "/completion",
  "/set-destination",
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path))
  if (!isProtected) return NextResponse.next()

  const authCookie = request.cookies.get("rakashi-auth")
  if (!authCookie || authCookie.value !== "1") {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
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
