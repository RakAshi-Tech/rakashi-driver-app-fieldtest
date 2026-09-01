/**
 * The one API failure that is not a failure.
 *
 * `callApi` throws on every non-2xx, so without this narrowing a driver who is
 * authenticated but not yet registered never reaches the profile screen - the
 * bug the Preview canary hit. The cases that must NOT be narrowed are the point
 * of the file: mapping a 401 or a 500 to "no profile" would push a driver whose
 * session merely expired into registering a second time.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  isNoDriverProfileError,
  withNoProfileAsNull,
  type DriverProfileSummary,
} from "../lib/profile.ts"

/** Exactly what lib/supabase.ts throws for a non-2xx. */
const httpError = (status: number, body: string) =>
  new Error(`HTTP ${status}: ${body}`)

const throwing = (err: unknown) => async () => {
  throw err
}

const PROFILE: DriverProfileSummary = { id: "d-1", name: "Ravi" }

// 1. login succeeds and the caller owns a profile -> the dashboard branch
test("a caller with a profile gets it back", async () => {
  const profile = await withNoProfileAsNull(async () => ({ data: PROFILE }))
  assert.deepEqual(profile, PROFILE)
})

// 2 + 3. the guard's own 403, from either call site -> the profile screen branch
test("403 No driver profile becomes null", async () => {
  const err = httpError(403, JSON.stringify({ error: "No driver profile" }))
  assert.equal(isNoDriverProfileError(err), true)
  assert.equal(await withNoProfileAsNull(throwing(err)), null)
})

test("a 200 carrying no row is also null", async () => {
  assert.equal(await withNoProfileAsNull(async () => ({ data: null })), null)
})

// 4. an unauthenticated answer is not a missing profile
test("401 is rethrown", async () => {
  const err = httpError(401, "Unauthorized")
  assert.equal(isNoDriverProfileError(err), false)
  await assert.rejects(withNoProfileAsNull(throwing(err)), /HTTP 401/)
})

// 5. a policy refusal shares the status but not the meaning
test("a generic 403 is rethrown", async () => {
  const err = httpError(403, JSON.stringify({ error: "Forbidden" }))
  assert.equal(isNoDriverProfileError(err), false)
  await assert.rejects(withNoProfileAsNull(throwing(err)), /Forbidden/)
})

test("403 Phone number already belongs to another profile is rethrown", async () => {
  const err = httpError(
    403,
    JSON.stringify({ error: "Phone number already belongs to another profile" })
  )
  assert.equal(isNoDriverProfileError(err), false)
  await assert.rejects(withNoProfileAsNull(throwing(err)), /already belongs/)
})

// 6. a server fault
test("500 is rethrown", async () => {
  const err = httpError(500, JSON.stringify({ error: "Internal error" }))
  assert.equal(isNoDriverProfileError(err), false)
  await assert.rejects(withNoProfileAsNull(throwing(err)), /HTTP 500/)
})

test("a network error is rethrown", async () => {
  const err = new TypeError("Failed to fetch")
  assert.equal(isNoDriverProfileError(err), false)
  await assert.rejects(withNoProfileAsNull(throwing(err)), /Failed to fetch/)
})

test("a 403 whose body is not the guard's JSON is rethrown", async () => {
  assert.equal(isNoDriverProfileError(httpError(403, "No driver profile")), false)
  assert.equal(isNoDriverProfileError(httpError(403, "")), false)
  // The message must not be matched loosely anywhere in the body.
  assert.equal(
    isNoDriverProfileError(httpError(403, JSON.stringify({ error: "x No driver profile" }))),
    false
  )
  assert.equal(isNoDriverProfileError("HTTP 403: {}"), false)
})

// Both call sites must go through the helper, or the bug returns on one of them.
test("the login screen reads its profile only through loadProfileOrNull", () => {
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
  const code = fs
    .readFileSync(path.join(repo, "app/login/page.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "") // strip comments

  const direct = code.match(/from\(["']driver_profiles["']\)\s*\.select\(/g) ?? []
  assert.equal(direct.length, 1, "only the helper may select driver_profiles")

  const calls = code.match(/await loadProfileOrNull\(\)/g) ?? []
  assert.equal(calls.length, 2, "the silent session check and the password login")
  assert.match(code, /withNoProfileAsNull/)
})
