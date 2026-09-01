'use strict'

/**
 * How a caller becomes a driver row.
 *
 * There is no migration path and no adoption of an existing profile by phone
 * number: identity is `sub`, and nothing else. These tests pin that, because the
 * difference between "found by cognito_sub" and "found by phone number" is
 * invisible in a passing happy path and is exactly where account takeover would
 * live while Phase 1 confirms accounts without verifying phone ownership.
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { resolveCaller, forgetCachedDriver } = require('../dist/identity.js')
const { fakeDb } = require('./helpers.js')

const E164 = '+919876543210'
let n = 0
/** A fresh subject per test - resolveCaller memoises by sub across calls. */
const freshSub = () => 'sub-' + ++n

test('a caller with a profile is found by cognito_sub', async () => {
  const sub = freshSub()
  const db = fakeDb((sql) => (sql.startsWith('SELECT id FROM driver_profiles') ? [{ id: 'driver-1' }] : []))
  const caller = await resolveCaller(db, { sub, phone_number: E164, token_use: 'access' })

  assert.equal(caller.driverId, 'driver-1')
  assert.equal(caller.sub, sub)
  assert.match(db.calls[0].sql, /SELECT id FROM driver_profiles WHERE cognito_sub = \$1/)
  assert.deepEqual(db.calls[0].params, [sub])
  forgetCachedDriver(sub)
})

test('a new Cognito user gets no profile and no row is adopted', async () => {
  const sub = freshSub()
  const db = fakeDb(() => []) // nothing matches: a genuinely new signup
  const caller = await resolveCaller(db, { sub, phone_number: E164, token_use: 'access' })

  // No driver row yet - the client's next step is to create one.
  assert.equal(caller.driverId, null)
  assert.equal(caller.phoneNumber, E164)

  // Nothing writes. In particular there is no statement that stamps cognito_sub
  // onto a row selected by phone number, which is how a profile could otherwise
  // be taken over by whoever registers that number.
  for (const call of db.calls) {
    assert.ok(!/^UPDATE/i.test(call.sql), 'resolveCaller must not write: ' + call.sql)
    assert.ok(!/cognito_sub IS NULL/i.test(call.sql), 'must not look for unclaimed rows: ' + call.sql)
  }
})

test('rows left behind with a NULL cognito_sub are unreachable', async () => {
  const sub = freshSub()
  // The database still holds the old test rows, but they match nothing: the only
  // lookup is by cognito_sub, and theirs is NULL.
  const db = fakeDb((sql, params) => {
    if (sql.startsWith('SELECT id FROM driver_profiles')) {
      const rows = [
        { id: 'test-row-1', cognito_sub: null, phone_number: '9123456789' },
        { id: 'test-row-2', cognito_sub: null, phone_number: '9155555555' },
      ]
      return rows.filter((r) => r.cognito_sub === params[0]).map((r) => ({ id: r.id }))
    }
    return []
  })
  const caller = await resolveCaller(db, { sub, phone_number: E164, token_use: 'access' })
  assert.equal(caller.driverId, null)
})

test('a phone number already on another account is refused, not left to the constraint', async () => {
  const sub = freshSub()
  const db = fakeDb((sql) => (sql.startsWith('SELECT 1 FROM driver_profiles') ? [{ '?column?': 1 }] : []))
  await assert.rejects(
    () => resolveCaller(db, { sub, phone_number: E164, token_use: 'access' }),
    { statusCode: 403 }
  )
})

test('a malformed phone claim is never carried through to storage', async () => {
  for (const bad of ['9876543210', '+91 98765 43210', 'not-a-number', '', '+0123456789']) {
    const sub = freshSub()
    const db = fakeDb(() => [])
    const caller = await resolveCaller(db, { sub, phone_number: bad, token_use: 'access' })
    assert.equal(caller.phoneNumber, null, 'rejected: ' + JSON.stringify(bad))
    // With no usable number there is nothing to check for a collision either.
    assert.equal(db.calls.length, 1)
  }
})

test('a well-formed E.164 claim is carried through unchanged', async () => {
  const sub = freshSub()
  const db = fakeDb(() => [])
  const caller = await resolveCaller(db, { sub, phone_number: E164, token_use: 'access' })
  assert.equal(caller.phoneNumber, E164)
})

test('the multi-format matcher built for the old test rows is gone', () => {
  const identity = require('../dist/identity.js')
  assert.equal(identity.phoneVariants, undefined)
})
