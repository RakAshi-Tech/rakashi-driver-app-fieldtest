/**
 * Shared fixtures for the Phase 1 authorization tests.
 *
 * The tests run against dist/, i.e. exactly the JavaScript that ships to Lambda,
 * rather than against the TypeScript sources.
 */
'use strict'

const CALLER_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_ID = '22222222-2222-2222-2222-222222222222'

/** A signed-in driver, as identity.ts would have resolved them from a token. */
const caller = {
  sub: 'cognito-sub-aaaa',
  phoneNumber: '+919876543210',
  driverId: CALLER_ID,
}

/**
 * A Pool stand-in that records every statement instead of running it.
 *
 * `rowsFor` lets a test decide what a statement returns; everything else comes
 * back empty, which is enough for assertions about the SQL that was built.
 */
function fakeDb(rowsFor = () => []) {
  const calls = []
  return {
    calls,
    /** Every statement issued, whitespace-collapsed for easy matching. */
    sql: () => calls.map((c) => c.sql),
    async query(sql, params) {
      const flat = String(sql).replace(/\s+/g, ' ').trim()
      calls.push({ sql: flat, params: params ?? [] })
      const rows = rowsFor(flat, params ?? []) ?? []
      return { rows, rowCount: rows.length }
    },
  }
}

/** The single statement a test expects to be the interesting one. */
function stmt(db, fragment) {
  const found = db.calls.filter((c) => c.sql.includes(fragment))
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one statement containing ${JSON.stringify(fragment)}, got ${found.length}:\n` +
        db.calls.map((c) => '  ' + c.sql).join('\n')
    )
  }
  return found[0]
}

module.exports = { caller, CALLER_ID, OTHER_ID, fakeDb, stmt }
