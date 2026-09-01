'use strict'

/**
 * Assertions about files outside the Lambda that the Lambda's policy depends on.
 *
 * These are the pairings that break silently: a screen that upserts on a key the
 * API refuses, or a migration whose index shape the upsert cannot use. Both fail
 * only at runtime against a real database, so they are pinned here instead.
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repo = path.join(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8')

test('onboarding no longer upserts driver_profiles on phone_number', () => {
  const src = read('app/onboarding/page.tsx')
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') // strip comments

  assert.ok(!/\.upsert\(/.test(code), 'onboarding must not upsert')
  assert.ok(!/onConflict/.test(code), 'onboarding must not name a conflict target')
  assert.ok(!/from\(["']driver_profiles["']\)/.test(code), 'onboarding must not write driver_profiles')
  assert.ok(!/trust_score/.test(code), 'onboarding must not send trust_score')
  assert.ok(!/phone_number/.test(code), 'onboarding must not send phone_number as an identifier')
  assert.ok(!/@\/lib\/supabase/.test(code), 'onboarding must not import the API client')
})

test('the profile screen that does write upserts on cognito_sub', () => {
  const code = read('app/login/page.tsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.match(code, /onConflict:\s*["']cognito_sub["']/)
  assert.ok(!/onConflict:\s*["']phone_number["']/.test(code))
})

test('/onboarding is gated behind a session', () => {
  const src = read('middleware.ts')
  assert.match(src, /"\/onboarding"/)
  assert.match(src, /"\/onboarding\/:path\*"/)
})

test('migration 001 creates a plain unique index, not a partial one', () => {
  const sql = read('infra/migrations/001_add_cognito_sub.sql')
  const statement = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')

  assert.match(statement, /CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_cognito_sub\s+ON driver_profiles \(cognito_sub\);/)
  // A partial index cannot be inferred by `ON CONFLICT (cognito_sub)`, which is
  // what the profile upsert emits, so the predicate must not come back.
  assert.ok(
    !/WHERE cognito_sub IS NOT NULL/.test(statement),
    'the index must not be partial'
  )
  assert.match(statement, /ADD COLUMN IF NOT EXISTS cognito_sub TEXT/)
})

test('the API CORS configuration allows the Authorization header', () => {
  const cors = JSON.parse(read('infra/api-cors.json'))
  const headers = cors.AllowHeaders.map((h) => h.toLowerCase())
  assert.ok(headers.includes('authorization'), 'authorization must be allowed')
  assert.ok(headers.includes('content-type'), 'content-type must be allowed')
  // A wildcard origin is only safe while no credentials ride along.
  assert.equal(cors.AllowCredentials, false)
})
