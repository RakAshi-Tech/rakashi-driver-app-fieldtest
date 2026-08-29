/**
 * Enforcement layer sitting between the wire format and the SQL builders.
 *
 * The client controls the table, operation, columns, filters and payload, so
 * every one of those is re-checked here against policy.ts. Ownership predicates
 * are appended after the caller's own filters and cannot be removed by anything
 * the client sends.
 */

import type { Pool } from 'pg'
import type { Caller } from './identity'
import { AuthError } from './identity'
import type { Operation, TablePolicy } from './policy'
import { policyFor } from './policy'

export function requirePolicy(table: string, operation: Operation): TablePolicy {
  const policy = policyFor(table)
  if (!policy) throw new AuthError(403, 'Forbidden')
  if (!policy.operations.includes(operation)) throw new AuthError(403, 'Forbidden')
  return policy
}

/** A caller with no profile row may only create one. */
export function requireDriverId(caller: Caller): string {
  if (!caller.driverId) throw new AuthError(403, 'No driver profile')
  return caller.driverId
}

/**
 * Drop everything the client is not allowed to write.
 *
 * Silently dropping rather than rejecting keeps existing call sites working -
 * several of them post whole objects that include server-owned fields such as
 * the hardcoded `driver_id: "demo"` in the tracking screen.
 */
export function sanitizeData(
  policy: TablePolicy,
  data: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!data) throw new AuthError(400, 'No data')
  const clean: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (policy.writable.includes(key)) clean[key] = data[key]
  }
  return clean
}

/**
 * Stamp the owner columns from the verified token, overwriting whatever the
 * client supplied. This is what makes driver_id and cognito_sub unforgeable.
 */
export function applyOwnership(
  table: string,
  policy: TablePolicy,
  caller: Caller,
  data: Record<string, unknown>
): Record<string, unknown> {
  if (table === 'driver_profiles') {
    data.cognito_sub = caller.sub
    if (caller.phoneNumber) data.phone_number = caller.phoneNumber
    return data
  }
  if (
    (policy.ownership === 'own' || policy.ownership === 'own_or_unassigned') &&
    policy.ownerColumn
  ) {
    data[policy.ownerColumn] = requireDriverId(caller)
  }
  return data
}

/**
 * SQL fragment restricting a statement to rows the caller owns, or null when the
 * table has no ownership concept.
 *
 * Values go through `params`, so the fragment carries only placeholders.
 */
export function ownershipPredicate(
  policy: TablePolicy,
  caller: Caller,
  params: unknown[]
): string | null {
  const quote = (name: string) => `"${name}"`

  switch (policy.ownership) {
    case 'own': {
      params.push(requireDriverId(caller))
      return `${quote(policy.ownerColumn!)} = $${params.length}`
    }
    case 'own_or_unassigned': {
      params.push(requireDriverId(caller))
      const owner = quote(policy.ownerColumn!)
      return `(${owner} = $${params.length} OR ${owner} IS NULL)`
    }
    case 'via': {
      const via = policy.via!
      params.push(requireDriverId(caller))
      return (
        `${quote(via.column)} IN (SELECT ${quote(via.parentKey)} ` +
        `FROM ${quote(via.parentTable)} WHERE ${quote(via.parentOwnerColumn)} = $${params.length})`
      )
    }
    case 'unowned':
      return null
  }
}

/** Combine the client's WHERE clause with the mandatory ownership predicate. */
export function mergeWhere(clientWhere: string, ownership: string | null): string {
  if (!ownership) return clientWhere
  if (!clientWhere) return `WHERE ${ownership}`
  return `${clientWhere} AND ${ownership}`
}

/**
 * For 'via' tables an insert names its parent explicitly, so confirm the caller
 * owns that parent before the row is written.
 */
export async function assertViaParentOwned(
  db: Pool,
  policy: TablePolicy,
  caller: Caller,
  data: Record<string, unknown>
): Promise<void> {
  if (policy.ownership !== 'via') return
  const via = policy.via!
  const parentId = data[via.column]
  if (!parentId) throw new AuthError(400, `${via.column} is required`)

  const owned = await db.query(
    `SELECT 1 FROM "${via.parentTable}"
      WHERE "${via.parentKey}" = $1 AND "${via.parentOwnerColumn}" = $2 LIMIT 1`,
    [parentId, requireDriverId(caller)]
  )
  if (!owned.rowCount) throw new AuthError(403, 'Forbidden')
}

export function assertUpsertConflict(policy: TablePolicy, onConflict: string | undefined): string {
  // Upserting on a client-chosen key is how a caller would overwrite someone
  // else's row, so only the keys named in policy are accepted.
  if (!onConflict || !policy.upsertOn?.includes(onConflict)) {
    throw new AuthError(403, 'Forbidden')
  }
  return onConflict
}

const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

/**
 * Pin every upload under the caller's own prefix. The key used to come straight
 * from the request, which let anyone write anywhere in the bucket.
 */
export function safeUploadKey(caller: Caller, requestedKey: string, contentType: string): string {
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    throw new AuthError(400, 'Unsupported content type')
  }
  const driverId = requireDriverId(caller)
  const leaf = String(requestedKey ?? '')
    .split('/')
    .pop()!
    .replace(/[^A-Za-z0-9._-]/g, '')
  if (!leaf || leaf.startsWith('.')) throw new AuthError(400, 'Invalid key')
  return `drivers/${driverId}/${leaf}`
}
