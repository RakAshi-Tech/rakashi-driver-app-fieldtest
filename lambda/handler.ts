/**
 * AWS Lambda handler for rakashi-driver-app
 *
 * Routes:
 *   POST /query              → CRUD against Aurora RDS (PostgreSQL)
 *   POST /storage/upload-url → S3 pre-signed upload URL
 *   POST /realtime/poll      → Poll for new rows (replaces Supabase Realtime)
 *
 * Deploy:
 *   Runtime : Node.js 22.x
 *   Handler : handler.handler
 *   Memory  : 512 MB
 *   Timeout : 30 s
 *   VPC     : same VPC/subnet as Aurora cluster
 *
 * Dependencies (package.json):
 *   "pg": "^8.12.0"
 *   "@aws-sdk/client-secrets-manager": "^3"
 *   "@aws-sdk/client-s3": "^3"
 *   "@aws-sdk/s3-request-presigner": "^3"
 *
 * IAM permissions required:
 *   secretsmanager:GetSecretValue  on SECRET_ARN
 *   s3:PutObject                   on S3_BUCKET/*
 *   s3:GetObject                   on S3_BUCKET/*  (for public URLs)
 *
 * CORS: handled by API Gateway v2 CORS configuration.
 * Do NOT add Access-Control-Allow-* headers here — duplicating them causes
 * browsers to reject responses with "Multiple values in Access-Control-Allow-Origin".
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Pool } from 'pg'
import type { Caller } from './identity'
import { AuthError, readClaims, resolveCaller, forgetCachedDriver } from './identity'
import {
  applyOwnership,
  assertUpsertConflict,
  assertViaParentOwned,
  mergeWhere,
  ownershipPredicate,
  requirePolicy,
  requireDriverId,
  safeUploadKey,
  sanitizeData,
} from './guard'

// ── Config ────────────────────────────────────────────────────────────────────

const REGION = 'ap-northeast-1'
const DB_HOST = 'deliveryawsstack-deliverydb7f90b8e0-zsdbo8tjfdwa.cne8momiezva.ap-northeast-1.rds.amazonaws.com'
const SECRET_ARN = 'arn:aws:secretsmanager:ap-northeast-1:093452070570:secret:delivery/aurora/credentials-wCM7C2'
const S3_BUCKET = 'delivery-app-pan-documents'

const VALID_TABLES = new Set([
  'driver_profiles',
  'gps_delivery_summary',
  'gps_track_points',
  'driver_shifts',
  'delivery_requests',
  'request_notifications',
  'ocr_logs',
  'penalties',
])

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
}

// ── AWS clients ───────────────────────────────────────────────────────────────

const secretsClient = new SecretsManagerClient({ region: REGION })
const s3Client = new S3Client({ region: REGION })

// ── DB connection pool (reused across warm invocations) ───────────────────────

let pool: Pool | null = null

async function getPool(): Promise<Pool> {
  if (pool) return pool

  // Prefer env vars (set when Lambda runs inside a VPC without Secrets Manager endpoint)
  const envUser     = process.env.DB_USER
  const envPassword = process.env.DB_PASSWORD
  const envDatabase = process.env.DB_NAME
  const envPort     = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined

  let user: string, password: string, database: string, port: number

  if (envUser && envPassword) {
    user     = envUser
    password = envPassword
    database = envDatabase ?? 'postgres'
    port     = envPort ?? 5432
  } else {
    // Fallback: retrieve from Secrets Manager (requires VPC endpoint or NAT gateway)
    const { SecretString } = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: SECRET_ARN })
    )
    const creds = JSON.parse(SecretString!) as {
      username: string
      password: string
      dbname?: string
      port?: number
    }
    user     = creds.username
    password = creds.password
    database = creds.dbname ?? 'postgres'
    port     = creds.port ?? 5432
  }

  pool = new Pool({
    host: process.env.DB_HOST ?? DB_HOST,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  return pool
}

// ── SQL helpers ───────────────────────────────────────────────────────────────

type FilterOp = 'eq' | 'gte' | 'lte' | 'not_is_null' | 'is_null'

interface Filter {
  column: string
  op: FilterOp
  value?: unknown
}

function col(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Invalid identifier: ${name}`)
  return `"${name}"`
}

function buildWhere(filters: Filter[], params: unknown[]): string {
  if (!filters.length) return ''
  const parts = filters.map(({ column, op, value }) => {
    if (op === 'not_is_null') return `${col(column)} IS NOT NULL`
    if (op === 'is_null')     return `${col(column)} IS NULL`
    params.push(value)
    if (op === 'eq')  return `${col(column)} = $${params.length}`
    if (op === 'gte') return `${col(column)} >= $${params.length}`
    if (op === 'lte') return `${col(column)} <= $${params.length}`
    throw new Error(`Unknown filter op: ${op}`)
  })
  return `WHERE ${parts.join(' AND ')}`
}

function parseColumns(columns: string): string {
  if (!columns || columns === '*') return '*'
  return columns.split(',').map(c => col(c.trim())).join(', ')
}

// ── Query handler ─────────────────────────────────────────────────────────────

interface QueryPayload {
  table: string
  operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  columns?: string
  filters?: Filter[]
  data?: Record<string, unknown>
  onConflict?: string
  single?: boolean
  orderBy?: { column: string; ascending: boolean }
  countExact?: boolean
  headOnly?: boolean
  limit?: number
}

async function handleQuery(payload: QueryPayload, caller: Caller): Promise<object> {
  const {
    table, operation, columns, filters = [],
    data, onConflict, single, orderBy, countExact, headOnly, limit,
  } = payload

  if (!VALID_TABLES.has(table)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid table name' }) }
  }

  // Default deny: unless policy.ts lists this table AND this operation, stop here.
  const policy = requirePolicy(table, operation)

  const db = await getPool()
  const params: unknown[] = []

  // ── SELECT ────────────────────────────────────────────────────────────────
  if (operation === 'select') {
    // A table with no ownership column would leak every driver's rows, so reads
    // are refused outright rather than returned unscoped.
    if (policy.ownership === 'unowned') throw new AuthError(403, 'Forbidden')

    const selectExpr = countExact ? 'COUNT(*) AS count' : parseColumns(columns ?? '*')
    const clientWhere = buildWhere(filters, params)
    const where = mergeWhere(clientWhere, ownershipPredicate(policy, caller, params))
    const order = orderBy
      ? `ORDER BY ${col(orderBy.column)} ${orderBy.ascending ? 'ASC' : 'DESC'}`
      : ''
    const limitClause = single ? 'LIMIT 1' : limit ? `LIMIT ${limit}` : ''
    const sql = [`SELECT ${selectExpr}`, `FROM "${table}"`, where, order, limitClause]
      .filter(Boolean).join(' ')

    const result = await db.query(sql, params)

    if (countExact || headOnly) {
      const count = parseInt(result.rows[0]?.count ?? '0', 10)
      return ok({ count, data: null, error: null })
    }
    const responseData = single ? (result.rows[0] ?? null) : result.rows
    return ok({ data: responseData, error: null })
  }

  // ── INSERT ────────────────────────────────────────────────────────────────
  if (operation === 'insert') {
    const clean = applyOwnership(table, policy, caller, sanitizeData(policy, data))
    await assertViaParentOwned(db, policy, caller, clean)

    const keys = Object.keys(clean)
    if (!keys.length) return { statusCode: 400, body: JSON.stringify({ error: 'No writable fields' }) }
    const values = Object.values(clean)
    const placeholders = values.map((_, i) => `$${i + 1}`)

    params.push(...values)
    const returning = columns ? `RETURNING ${parseColumns(columns)}` : 'RETURNING *'
    const sql = `INSERT INTO "${table}" (${keys.map(col).join(', ')}) VALUES (${placeholders.join(', ')}) ${returning}`
    const result = await db.query(sql, params)
    const responseData = single ? (result.rows[0] ?? null) : result.rows
    return ok({ data: responseData, error: null })
  }

  // ── UPSERT ────────────────────────────────────────────────────────────────
  if (operation === 'upsert') {
    // Only the conflict keys named in policy are accepted. Upserting on
    // phone_number used to let any caller overwrite the profile holding that
    // number; cognito_sub comes from the token and identifies only the caller.
    const conflictKey = assertUpsertConflict(policy, onConflict)
    const clean = applyOwnership(table, policy, caller, sanitizeData(policy, data))

    const keys = Object.keys(clean)
    if (!keys.length) return { statusCode: 400, body: JSON.stringify({ error: 'No writable fields' }) }
    const values = Object.values(clean)
    const placeholders = values.map((_, i) => `$${i + 1}`)

    // Non-conflict columns use EXCLUDED for the DO UPDATE SET clause
    const updateCols = keys.filter(k => k !== conflictKey)
    const updateSet = updateCols.map(k => `${col(k)} = EXCLUDED.${col(k)}`).join(', ')

    params.push(...values)
    const returning = columns ? `RETURNING ${parseColumns(columns)}` : 'RETURNING *'
    const sql = [
      `INSERT INTO "${table}" (${keys.map(col).join(', ')}) VALUES (${placeholders.join(', ')})`,
      `ON CONFLICT (${col(conflictKey)}) DO UPDATE SET ${updateSet}`,
      returning,
    ].join(' ')

    const result = await db.query(sql, params)
    // A first upsert creates this caller's profile, so the cached "no profile
    // yet" answer has to go.
    forgetCachedDriver(caller.sub)
    const responseData = single ? (result.rows[0] ?? null) : result.rows
    return ok({ data: responseData, error: null })
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (operation === 'update') {
    const clean = sanitizeData(policy, data)
    // Accepting an open job assigns it to the caller. The value is taken from
    // the token, so a driver cannot hand a job to someone else - or take one.
    if (policy.ownership === 'own_or_unassigned' && data?.[policy.ownerColumn!] !== undefined) {
      clean[policy.ownerColumn!] = requireDriverId(caller)
    }
    const keys = Object.keys(clean)
    if (!keys.length) return { statusCode: 400, body: JSON.stringify({ error: 'No writable fields' }) }

    const setClauses = keys.map((k) => {
      params.push(clean[k])
      return `${col(k)} = $${params.length}`
    })
    const clientWhere = buildWhere(filters, params)
    const where = mergeWhere(clientWhere, ownershipPredicate(policy, caller, params))
    const sql = `UPDATE "${table}" SET ${setClauses.join(', ')} ${where}`.trim()
    await db.query(sql, params)
    return ok({ data: null, error: null })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (operation === 'delete') {
    if (!filters.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'delete requires at least one filter' }) }
    }
    const clientWhere = buildWhere(filters, params)
    const where = mergeWhere(clientWhere, ownershipPredicate(policy, caller, params))
    const sql = `DELETE FROM "${table}" ${where}`.trim()
    await db.query(sql, params)
    return ok({ data: null, error: null })
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown operation' }) }
}

// ── Storage: pre-signed upload URL ───────────────────────────────────────────

async function handleUploadUrl(
  body: { bucket?: string; key: string; contentType: string },
  caller: Caller
): Promise<object> {
  // The requested key is treated as a filename suggestion only; the caller's own
  // prefix is prepended so nobody can sign a URL for another driver's objects.
  const key = safeUploadKey(caller, body.key, body.contentType)
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: body.contentType,
  })
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 })
  // `key` is returned because it may differ from what was asked for, and the
  // client needs the real path to build the public URL.
  return ok({ uploadUrl, key })
}

// ── Realtime: polling endpoint ────────────────────────────────────────────────

async function handleRealtimePoll(
  body: { table: string; filter?: string; since: string },
  caller: Caller
): Promise<object> {
  const { table, filter, since } = body

  if (!VALID_TABLES.has(table)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid table' }) }
  }

  // Polling is a read, so it goes through the same select policy and ownership
  // rules. Without this it returned the 20 newest rows of any table to anyone.
  const policy = requirePolicy(table, 'select')
  if (policy.ownership === 'unowned') throw new AuthError(403, 'Forbidden')

  const db = await getPool()
  const params: unknown[] = [since]
  let sql = `SELECT * FROM "${table}" WHERE created_at > $1`
  sql += ` AND ${ownershipPredicate(policy, caller, params)}`

  // Parse Supabase-style filter: "driver_id=eq.some-uuid"
  if (filter) {
    const match = filter.match(/^(\w+)=eq\.(.+)$/)
    if (match) {
      const [, column, value] = match
      if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid filter column' }) }
      }
      params.push(value)
      sql += ` AND "${column}" = $${params.length}`
    }
  }

  sql += ' ORDER BY created_at ASC LIMIT 20'
  const result = await db.query(sql, params)
  return ok({ rows: result.rows })
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(body: unknown): object {
  return { statusCode: 200, body: JSON.stringify(body) }
}

function err(statusCode: number, message: string): object {
  return { statusCode, body: JSON.stringify({ error: message }) }
}

// ── Lambda entry point ────────────────────────────────────────────────────────

export const handler = async (event: {
  path?: string
  rawPath?: string
  httpMethod?: string
  requestContext?: {
    http?: { method?: string }
    stage?: string
    authorizer?: { jwt?: { claims?: Record<string, unknown> } }
  }
  body?: string | null
  queryStringParameters?: Record<string, string>
}): Promise<{
  statusCode: number
  headers: Record<string, string>
  body: string
}> => {
  const rawPath = event.path ?? event.rawPath ?? '/'
  const stage   = event.requestContext?.stage
  // HTTP API v2 with named stage includes the stage prefix in rawPath (/prod/query → /query)
  const path = (stage && rawPath.startsWith(`/${stage}/`))
    ? rawPath.slice(stage.length + 1)
    : rawPath
  const method = event.httpMethod ?? event.requestContext?.http?.method ?? 'POST'

  // OPTIONS preflight is handled by Function URL CORS config before Lambda is invoked.
  // This branch is a safety fallback only.
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: '' }
  }

  let result: object

  try {
    const body = event.body
      ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
      : {}

    // Identity is established once, from the JWT only, before any route runs.
    // resolveCaller also links a pre-Cognito profile to its new account on first
    // sign-in, so nothing downstream ever has to look at the request body to
    // work out who is calling.
    const claims = readClaims(event)
    const caller = await resolveCaller(await getPool(), claims)

    if (path === '/query' && method === 'POST') {
      result = await handleQuery(body as QueryPayload, caller)
    } else if (path === '/storage/upload-url' && method === 'POST') {
      result = await handleUploadUrl(body, caller)
    } else if (path === '/realtime/poll' && method === 'POST') {
      result = await handleRealtimePoll(body, caller)
    } else {
      result = err(404, `Not found: ${method} ${path}`)
    }
  } catch (e) {
    if (e instanceof AuthError) {
      // Deliberately terse: telling a caller whether a row exists but belongs to
      // someone else is itself a disclosure.
      result = err(e.statusCode, e.message)
    } else {
      console.error('Handler error:', e)
      result = err(500, 'Internal server error')
    }
  }

  const { statusCode, body } = result as { statusCode: number; body: string }
  return { statusCode, headers: RESPONSE_HEADERS, body }
}
