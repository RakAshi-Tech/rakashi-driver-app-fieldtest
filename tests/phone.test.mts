/**
 * The Preview-only test number.
 *
 * `toE164India` is the single gate every number passes through on its way to
 * Cognito, so the Preview exception has to live here - and so does the proof
 * that it stays in Preview. The Production cases below are the ones that matter:
 * a regression there puts an unreachable number into the real pool.
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { toE164India } from "../lib/phone.ts"

const PREVIEW_NUMBER = "1234567890"

/** VERCEL_ENV is read at call time, so each case sets the environment it means. */
function withEnv<T>(value: string | undefined, run: () => T): T {
  const before = process.env.VERCEL_ENV
  if (value === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = value
  try {
    return run()
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = before
  }
}

test("preview accepts the test number as +911234567890", () => {
  withEnv("preview", () => {
    assert.equal(toE164India(PREVIEW_NUMBER), "+911234567890")
  })
})

test("preview treats the test number the same in every input shape", () => {
  withEnv("preview", () => {
    // The same number, so the exception has to hold for it whichever way the
    // login screen or a retry happens to send it.
    assert.equal(toE164India("+91 1234567890"), "+911234567890")
    assert.equal(toE164India("911234567890"), "+911234567890")
    assert.equal(toE164India("01234567890"), "+911234567890")
  })
})

test("production rejects the test number", () => {
  withEnv("production", () => {
    assert.equal(toE164India(PREVIEW_NUMBER), null)
    assert.equal(toE164India("+911234567890"), null)
  })
})

test("a build with no VERCEL_ENV rejects the test number", () => {
  withEnv(undefined, () => {
    assert.equal(toE164India(PREVIEW_NUMBER), null)
  })
})

test("preview leaves normal Indian mobile numbers on the usual rules", () => {
  withEnv("preview", () => {
    assert.equal(toE164India("9876543210"), "+919876543210")
    assert.equal(toE164India("+91 98765 43210"), "+919876543210")
    assert.equal(toE164India("09876543210"), "+919876543210")
    assert.equal(toE164India("6000000000"), "+916000000000")
  })
})

test("preview still rejects every other invalid number", () => {
  withEnv("preview", () => {
    // Neighbours of the exception: one digit off in either direction.
    assert.equal(toE164India("1234567891"), null)
    assert.equal(toE164India("123456789"), null)
    assert.equal(toE164India("12345678901"), null)
    // Below the Indian mobile range.
    assert.equal(toE164India("5876543210"), null)
    assert.equal(toE164India("0000000000"), null)
    assert.equal(toE164India(""), null)
    assert.equal(toE164India("abcdefghij"), null)
  })
})

test("production is unchanged for normal numbers", () => {
  withEnv("production", () => {
    assert.equal(toE164India("9876543210"), "+919876543210")
    assert.equal(toE164India("5876543210"), null)
  })
})
