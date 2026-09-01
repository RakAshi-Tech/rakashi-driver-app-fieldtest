'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { POLICIES, policyFor } = require('../dist/policy.js')
const {
  applyOwnership,
  assertScopedWrite,
  assertUpsertConflict,
  ownershipPredicate,
  safeUploadKey,
  sanitizeData,
  serverSetClauses,
} = require('../dist/guard.js')
const { caller, CALLER_ID, OTHER_ID } = require('./helpers.js')

// ── Server-owned columns are not writable from a client ──────────────────────

test('trust_score cannot be set by a client', () => {
  const clean = sanitizeData(POLICIES.driver_profiles, {
    name: 'Real Name',
    trust_score: 100,
  })
  assert.equal(clean.trust_score, undefined)
  assert.equal(clean.name, 'Real Name')
  assert.ok(!POLICIES.driver_profiles.writable.includes('trust_score'))
})

test('total_earnings_inr and total_deliveries cannot be set by a client', () => {
  const clean = sanitizeData(POLICIES.driver_profiles, {
    name: 'Real Name',
    total_earnings_inr: 999999,
    total_deliveries: 5000,
  })
  assert.equal(clean.total_earnings_inr, undefined)
  assert.equal(clean.total_deliveries, undefined)
  for (const c of ['total_earnings_inr', 'total_deliveries', 'is_active', 'cognito_sub', 'phone_number']) {
    assert.ok(!POLICIES.driver_profiles.writable.includes(c), `${c} must not be writable`)
  }
})

test('final_fare_inr is not a client-writable column', () => {
  const clean = sanitizeData(POLICIES.delivery_requests, {
    status: 'delivered',
    final_fare_inr: 99999,
  })
  assert.equal(clean.final_fare_inr, undefined)
  assert.ok(!POLICIES.delivery_requests.writable.includes('final_fare_inr'))
})

test('final_fare_inr is settled server-side from proposed_fare_inr on delivery', () => {
  assert.deepEqual(
    serverSetClauses('delivery_requests', { status: 'delivered' }),
    ['"final_fare_inr" = "proposed_fare_inr"']
  )
  // Not on any other transition, and not on other tables.
  assert.deepEqual(serverSetClauses('delivery_requests', { status: 'picked_up' }), [])
  assert.deepEqual(serverSetClauses('driver_shifts', { status: 'delivered' }), [])
})

// ── Ownership is taken from the token, never from the payload ────────────────

test('a driver_id supplied by the client is overwritten with the caller', () => {
  const clean = applyOwnership(
    'driver_shifts',
    POLICIES.driver_shifts,
    caller,
    sanitizeData(POLICIES.driver_shifts, { shift_date: '2026-08-30', driver_id: OTHER_ID })
  )
  assert.equal(clean.driver_id, CALLER_ID)
})

test('driver_profiles ownership is stamped from the token', () => {
  const clean = applyOwnership('driver_profiles', POLICIES.driver_profiles, caller, {
    name: 'Real Name',
    cognito_sub: 'attacker-sub',
    phone_number: '+910000000000',
  })
  assert.equal(clean.cognito_sub, caller.sub)
  assert.equal(clean.phone_number, caller.phoneNumber)
})

test('ownership predicates bind the caller, not a client value', () => {
  const params = []
  assert.equal(ownershipPredicate(POLICIES.driver_profiles, caller, params), '"id" = $1')
  assert.deepEqual(params, [CALLER_ID])

  const p2 = []
  assert.equal(
    ownershipPredicate(POLICIES.delivery_requests, caller, p2),
    '("driver_id" = $1 OR "driver_id" IS NULL)'
  )
  assert.deepEqual(p2, [CALLER_ID])

  const p3 = []
  assert.match(ownershipPredicate(POLICIES.gps_track_points, caller, p3), /IN \(SELECT "id" FROM "gps_delivery_summary" WHERE "driver_id" = \$1\)/)
  assert.deepEqual(p3, [CALLER_ID])
})

// ── Default deny ─────────────────────────────────────────────────────────────

test('upsert only accepts the conflict targets named in policy', () => {
  assert.equal(assertUpsertConflict(POLICIES.driver_profiles, 'cognito_sub'), 'cognito_sub')
  assert.throws(() => assertUpsertConflict(POLICIES.driver_profiles, 'phone_number'), { statusCode: 403 })
  assert.throws(() => assertUpsertConflict(POLICIES.driver_profiles, undefined), { statusCode: 403 })
})

test('an unlisted table has no policy', () => {
  assert.equal(policyFor('pg_catalog'), null)
  assert.equal(policyFor('constructor'), null)
})

// ── N-5: a write nothing scopes is refused ───────────────────────────────────

test('an unowned table refuses an update with no filter', () => {
  assert.throws(() => assertScopedWrite(POLICIES.ocr_logs, []), { statusCode: 400 })
  assert.throws(() => assertScopedWrite(POLICIES.ocr_logs, undefined), { statusCode: 400 })
  // With a filter it is allowed through.
  assert.doesNotThrow(() => assertScopedWrite(POLICIES.ocr_logs, [{ column: 'id' }]))
  // Owned tables are already narrowed by their ownership predicate.
  assert.doesNotThrow(() => assertScopedWrite(POLICIES.driver_shifts, []))
})

// ── Uploads land under the caller's own prefix ───────────────────────────────

test('upload keys are pinned under the caller prefix', () => {
  assert.equal(
    safeUploadKey(caller, '../../other-driver/secret.jpg', 'image/jpeg'),
    `drivers/${CALLER_ID}/secret.jpg`
  )
  assert.throws(() => safeUploadKey(caller, 'x.sh', 'application/x-sh'), { statusCode: 400 })
})
