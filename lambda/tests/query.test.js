'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { handleQuery, handleRealtimePoll } = require('../dist/handler.js')
const { caller, CALLER_ID, OTHER_ID, fakeDb, stmt } = require('./helpers.js')

const body = (res) => JSON.parse(res.body)

// -- Reads are scoped to the caller, whatever the client asks for -------------

test('a select for another driver still only matches the caller', async () => {
  const db = fakeDb()
  await handleQuery(
    {
      table: 'driver_profiles',
      operation: 'select',
      filters: [{ column: 'id', op: 'eq', value: OTHER_ID }],
    },
    caller,
    db
  )
  const q = stmt(db, 'SELECT')
  // The client filter survives, but the ownership predicate is ANDed after it,
  // so the two can only both hold for the caller's own row.
  assert.match(q.sql, /WHERE "id" = \$1 AND "id" = \$2/)
  assert.deepEqual(q.params, [OTHER_ID, CALLER_ID])
})

test('a poll cannot be widened past the caller', async () => {
  const db = fakeDb()
  await handleRealtimePoll(
    {
      table: 'request_notifications',
      filter: 'driver_id=eq.' + OTHER_ID,
      since: '2026-01-01T00:00:00Z',
    },
    caller,
    db
  )
  const q = stmt(db, 'SELECT * FROM "request_notifications"')
  assert.match(q.sql, /AND "driver_id" = \$2/)
  assert.equal(q.params[1], CALLER_ID)
})

test('a read of an unowned table is refused outright', async () => {
  const db = fakeDb()
  await assert.rejects(
    () => handleQuery({ table: 'ocr_logs', operation: 'select' }, caller, db),
    { statusCode: 403 }
  )
  assert.equal(db.calls.length, 0)
})

// -- B-6: lifetime totals move only through the server-side recount -----------

test('completing a delivery recounts the profile totals from the caller own rows', async () => {
  const db = fakeDb()
  await handleQuery(
    {
      table: 'gps_delivery_summary',
      operation: 'update',
      data: { completed_at: '2026-08-30T10:00:00Z', earnings_inr: 250 },
      filters: [{ column: 'id', op: 'eq', value: 'delivery-1' }],
    },
    caller,
    db
  )
  const recount = stmt(db, 'UPDATE driver_profiles')
  assert.match(
    recount.sql,
    /total_deliveries = \( SELECT COUNT\(\*\) FROM gps_delivery_summary WHERE driver_id = p\.id AND completed_at IS NOT NULL\)/
  )
  assert.match(recount.sql, /total_earnings_inr = \( SELECT COALESCE\(SUM\(earnings_inr\), 0\)/)
  assert.match(recount.sql, /WHERE p\.id = \$1/)
  // The recount is bound to the caller, and no client number reaches it.
  assert.deepEqual(recount.params, [CALLER_ID])
})

test('a client cannot smuggle totals into the delivery update', async () => {
  const db = fakeDb()
  await handleQuery(
    {
      table: 'gps_delivery_summary',
      operation: 'update',
      data: {
        completed_at: '2026-08-30T10:00:00Z',
        total_earnings_inr: 999999,
        trust_score: 100,
      },
      filters: [{ column: 'id', op: 'eq', value: 'delivery-1' }],
    },
    caller,
    db
  )
  const upd = stmt(db, 'UPDATE "gps_delivery_summary"')
  assert.ok(!upd.sql.includes('total_earnings_inr'))
  assert.ok(!upd.sql.includes('trust_score'))
  assert.ok(!upd.params.includes(999999))
})

test('an unfinished delivery does not trigger a recount', async () => {
  const db = fakeDb()
  await handleQuery(
    {
      table: 'gps_delivery_summary',
      operation: 'update',
      data: { total_distance_km: 4.2 },
      filters: [{ column: 'id', op: 'eq', value: 'delivery-1' }],
    },
    caller,
    db
  )
  assert.equal(db.sql().filter((s) => s.includes('UPDATE driver_profiles')).length, 0)
})

// -- B-5: the fare comes from the row, not the request ------------------------

test('delivering a job copies the fare server-side and ignores the client figure', async () => {
  const db = fakeDb()
  await handleQuery(
    {
      table: 'delivery_requests',
      operation: 'update',
      data: {
        status: 'delivered',
        delivered_at: '2026-08-30T10:00:00Z',
        final_fare_inr: 99999,
      },
      filters: [{ column: 'id', op: 'eq', value: 'req-1' }],
    },
    caller,
    db
  )
  const upd = stmt(db, 'UPDATE "delivery_requests"')
  assert.match(upd.sql, /"final_fare_inr" = "proposed_fare_inr"/)
  // 99999 never becomes a bound parameter.
  assert.ok(!upd.params.includes(99999))
  assert.match(upd.sql, /\("driver_id" = \$\d+ OR "driver_id" IS NULL\)/)
})

// -- B-4: the delivery record keeps the columns the app writes ----------------

test('route, earnings, duration and coordinates are stored', async () => {
  const db = fakeDb(() => [{ id: 'delivery-1' }])
  const route = [
    [12.97, 77.59],
    [12.98, 77.6],
  ]
  const res = await handleQuery(
    {
      table: 'gps_delivery_summary',
      operation: 'insert',
      data: {
        job_id: 'job-1',
        shift_date: '2026-08-30',
        started_at: '2026-08-30T09:00:00Z',
        route_coordinates: route,
        start_lat: 12.97,
        start_lng: 77.59,
        end_lat: 12.98,
        end_lng: 77.6,
        earnings_inr: 250,
        total_duration_min: 42,
        driver_id: OTHER_ID,
      },
      single: true,
    },
    caller,
    db
  )
  assert.equal(body(res).error, null)
  const ins = stmt(db, 'INSERT INTO "gps_delivery_summary"')
  const expected = [
    'route_coordinates',
    'shift_date',
    'earnings_inr',
    'total_duration_min',
    'start_lat',
    'start_lng',
    'end_lat',
    'end_lng',
  ]
  for (const c of expected) {
    assert.ok(ins.sql.includes('"' + c + '"'), c + ' should be written')
  }
  // jsonb is bound as JSON text, not as a PostgreSQL array literal.
  assert.ok(ins.params.includes(JSON.stringify(route)))
  // driver_id is the caller's, not the one that was sent.
  assert.ok(ins.params.includes(CALLER_ID))
  assert.ok(!ins.params.includes(OTHER_ID))
})

// -- N-5: nothing can update every row of an unowned table --------------------

test('an ocr_logs update with no filter is refused', async () => {
  const db = fakeDb()
  await assert.rejects(
    () =>
      handleQuery(
        { table: 'ocr_logs', operation: 'update', data: { was_corrected: true } },
        caller,
        db
      ),
    { statusCode: 400 }
  )
  assert.equal(db.calls.length, 0)
})

test('an ocr_logs update with a filter is allowed and stays narrowed', async () => {
  const db = fakeDb()
  await handleQuery(
    {
      table: 'ocr_logs',
      operation: 'update',
      data: { was_corrected: true },
      filters: [{ column: 'id', op: 'eq', value: 'log-1' }],
    },
    caller,
    db
  )
  const upd = stmt(db, 'UPDATE "ocr_logs"')
  assert.match(upd.sql, /WHERE "id" = \$2/)
})

// -- The profile upsert matches the index the migration creates ---------------

test('the profile upsert conflicts on cognito_sub with no index predicate', async () => {
  const db = fakeDb(() => [{ id: CALLER_ID }])
  await handleQuery(
    {
      table: 'driver_profiles',
      operation: 'upsert',
      onConflict: 'cognito_sub',
      data: { name: 'Real Name', trust_score: 100 },
      single: true,
    },
    caller,
    db
  )
  const up = stmt(db, 'INSERT INTO "driver_profiles"')
  // A predicate here would require a matching partial index; migration 001
  // creates a plain unique index, so the plain form is the correct one.
  assert.match(up.sql, /ON CONFLICT \("cognito_sub"\) DO UPDATE SET/)
  assert.ok(!up.sql.includes('ON CONFLICT ("cognito_sub") WHERE'))
  assert.ok(!up.sql.includes('trust_score'))
})

test('the profile upsert refuses phone_number as a conflict target', async () => {
  const db = fakeDb()
  await assert.rejects(
    () =>
      handleQuery(
        {
          table: 'driver_profiles',
          operation: 'upsert',
          onConflict: 'phone_number',
          data: { name: 'x' },
        },
        caller,
        db
      ),
    { statusCode: 403 }
  )
})
