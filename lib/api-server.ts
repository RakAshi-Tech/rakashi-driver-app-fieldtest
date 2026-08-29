/**
 * Minimal server-side query helper.
 *
 * Route handlers run without a browser session, so they cannot use lib/supabase
 * (which reads the in-memory access token). Instead they forward the token the
 * caller already sent, keeping every database write attributable to a real
 * signed-in driver rather than to the server itself.
 */

const API_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? ""

export interface ServerQueryResult<T> {
  data: T | null
  error: { message: string } | null
}

/** Pull the bearer token off an incoming request, if present. */
export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header?.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

export async function serverQuery<T = unknown>(
  payload: unknown,
  token: string
): Promise<ServerQueryResult<T>> {
  if (!API_URL) return { data: null, error: { message: "API_GATEWAY_URL not configured" } }

  const res = await fetch(`${API_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    return { data: null, error: { message: `HTTP ${res.status}` } }
  }
  return res.json() as Promise<ServerQueryResult<T>>
}
