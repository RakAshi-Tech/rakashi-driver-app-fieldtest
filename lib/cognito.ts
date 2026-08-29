/**
 * Server-side Cognito client.
 *
 * Every call lives behind a route handler rather than in the browser. That is
 * what lets the app client hold a secret and the refresh token live in an
 * HttpOnly cookie - JavaScript in the page never sees either one.
 *
 * The unauthenticated Cognito operations used here need no SigV4 signing, so
 * plain fetch is enough and no AWS SDK dependency is pulled in.
 */

import { createHmac } from "crypto"

const REGION = process.env.COGNITO_REGION ?? "ap-northeast-1"
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? ""
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET ?? ""

const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`

export class CognitoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET)
}

/** Cognito requires HMAC(username + clientId, clientSecret) for secret-bearing clients. */
function secretHash(username: string): string {
  return createHmac("sha256", CLIENT_SECRET).update(username + CLIENT_ID).digest("base64")
}

/** Map Cognito's exception names onto statuses and messages safe to show a driver. */
function toClientError(status: number, name: string): CognitoError {
  const code = name.split("#").pop() ?? name
  switch (code) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return new CognitoError(401, code, "Incorrect phone number or password")
    case "UsernameExistsException":
      return new CognitoError(409, code, "This phone number is already registered")
    case "InvalidPasswordException":
      return new CognitoError(400, code, "Password does not meet the requirements")
    case "InvalidParameterException":
      return new CognitoError(400, code, "Invalid phone number or password")
    case "TooManyRequestsException":
    case "LimitExceededException":
      return new CognitoError(429, code, "Too many attempts. Please wait and try again")
    case "UserNotConfirmedException":
      return new CognitoError(403, code, "Account is not confirmed")
    default:
      return new CognitoError(status >= 400 && status < 500 ? 400 : 502, code, "Authentication failed")
  }
}

async function call<T>(target: string, body: unknown): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { __type?: string }
    throw toClientError(res.status, payload.__type ?? "UnknownError")
  }
  return res.json() as Promise<T>
}

export interface Tokens {
  accessToken: string
  /** Identity claims for display only; never used to authorize the API. */
  idToken: string
  refreshToken: string
  expiresIn: number
  /** Cognito's internal username, needed to refresh with a secret-bearing client. */
  username: string
}

interface AuthResponse {
  AuthenticationResult?: {
    AccessToken: string
    IdToken: string
    RefreshToken?: string
    ExpiresIn: number
  }
  ChallengeName?: string
}

/** Read a claim out of a token we just received over TLS from Cognito itself. */
function claimFromToken(token: string, claim: string): string {
  try {
    const payload = token.split(".")[1]
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    return String(JSON.parse(json)[claim] ?? "")
  } catch {
    return ""
  }
}

function toTokens(res: AuthResponse, fallbackRefresh?: string): Tokens {
  const result = res.AuthenticationResult
  if (!result) {
    // Phase 1 uses password auth only, so no challenge should ever come back.
    // Phase 2 (SMS_OTP) is where ChallengeName starts carrying meaning.
    throw new CognitoError(500, res.ChallengeName ?? "NoAuthResult", "Unexpected authentication response")
  }
  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken ?? fallbackRefresh ?? "",
    expiresIn: result.ExpiresIn,
    username: claimFromToken(result.AccessToken, "username"),
  }
}

export async function signUp(phoneNumber: string, password: string): Promise<void> {
  await call("SignUp", {
    ClientId: CLIENT_ID,
    SecretHash: secretHash(phoneNumber),
    Username: phoneNumber,
    Password: password,
    UserAttributes: [{ Name: "phone_number", Value: phoneNumber }],
  })
  // The pre-signup trigger confirms the account, so sign-in works immediately.
}

export async function signIn(phoneNumber: string, password: string): Promise<Tokens> {
  const res = await call<AuthResponse>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: {
      USERNAME: phoneNumber,
      PASSWORD: password,
      SECRET_HASH: secretHash(phoneNumber),
    },
  })
  return toTokens(res)
}

export async function refresh(refreshToken: string, username: string): Promise<Tokens> {
  const res = await call<AuthResponse>("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
      // Computed from the internal username, not the phone number.
      SECRET_HASH: secretHash(username),
    },
  })
  // A refresh response omits the refresh token; the existing one stays valid.
  return toTokens(res, refreshToken)
}

export async function revoke(refreshToken: string): Promise<void> {
  try {
    await call("RevokeToken", {
      Token: refreshToken,
      ClientId: CLIENT_ID,
      ClientSecret: CLIENT_SECRET,
    })
  } catch {
    // Logout must succeed locally even if the token was already invalid.
  }
}
