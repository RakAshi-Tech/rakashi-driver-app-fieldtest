/**
 * One-off migration runner (AWS Lambda entry point).
 *
 * The RDS instance is not publicly reachable, so DDL has to originate from
 * inside the VPC. This runs on the same subnets and security group as the API
 * Lambda, executes the statements it is handed, and is deleted immediately
 * afterwards by run-migration.sh.
 *
 * It is deliberately dumb. It holds no SQL of its own, keeps no state, and takes
 * its database credentials from the environment the caller sets on it - which
 * run-migration.sh copies from the existing API Lambda rather than storing
 * anywhere. Nothing secret is written to a file or logged.
 */
'use strict'

const { Client } = require('pg')

exports.handler = async (event) => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  try {
    const results = []
    for (const sql of event.statements || []) {
      const res = await client.query(sql)
      // A multi-statement string comes back as an array of results.
      const list = Array.isArray(res) ? res : [res]
      results.push(list.map((r) => ({ command: r.command, rowCount: r.rowCount, rows: r.rows })))
    }
    return { ok: true, results }
  } catch (e) {
    // The message can name a column or constraint, never row data.
    return { ok: false, error: e.message, code: e.code }
  } finally {
    await client.end()
  }
}
