"use strict";
/**
 * Enforcement layer sitting between the wire format and the SQL builders.
 *
 * The client controls the table, operation, columns, filters and payload, so
 * every one of those is re-checked here against policy.ts. Ownership predicates
 * are appended after the caller's own filters and cannot be removed by anything
 * the client sends.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePolicy = requirePolicy;
exports.requireDriverId = requireDriverId;
exports.sanitizeData = sanitizeData;
exports.applyOwnership = applyOwnership;
exports.ownershipPredicate = ownershipPredicate;
exports.mergeWhere = mergeWhere;
exports.assertViaParentOwned = assertViaParentOwned;
exports.assertScopedWrite = assertScopedWrite;
exports.serverSetClauses = serverSetClauses;
exports.assertUpsertConflict = assertUpsertConflict;
exports.safeUploadKey = safeUploadKey;
const identity_1 = require("./identity");
const policy_1 = require("./policy");
function requirePolicy(table, operation) {
    const policy = (0, policy_1.policyFor)(table);
    if (!policy)
        throw new identity_1.AuthError(403, 'Forbidden');
    if (!policy.operations.includes(operation))
        throw new identity_1.AuthError(403, 'Forbidden');
    return policy;
}
/** A caller with no profile row may only create one. */
function requireDriverId(caller) {
    if (!caller.driverId)
        throw new identity_1.AuthError(403, 'No driver profile');
    return caller.driverId;
}
/**
 * Drop everything the client is not allowed to write.
 *
 * Silently dropping rather than rejecting keeps existing call sites working -
 * several of them post whole objects that include server-owned fields such as
 * the hardcoded `driver_id: "demo"` in the tracking screen.
 */
function sanitizeData(policy, data) {
    if (!data)
        throw new identity_1.AuthError(400, 'No data');
    const clean = {};
    for (const key of Object.keys(data)) {
        if (policy.writable.includes(key))
            clean[key] = data[key];
    }
    return clean;
}
/**
 * Stamp the owner columns from the verified token, overwriting whatever the
 * client supplied. This is what makes driver_id and cognito_sub unforgeable.
 */
function applyOwnership(table, policy, caller, data) {
    if (table === 'driver_profiles') {
        data.cognito_sub = caller.sub;
        if (caller.phoneNumber)
            data.phone_number = caller.phoneNumber;
        return data;
    }
    if ((policy.ownership === 'own' || policy.ownership === 'own_or_unassigned') &&
        policy.ownerColumn) {
        data[policy.ownerColumn] = requireDriverId(caller);
    }
    return data;
}
/**
 * SQL fragment restricting a statement to rows the caller owns, or null when the
 * table has no ownership concept.
 *
 * Values go through `params`, so the fragment carries only placeholders.
 */
function ownershipPredicate(policy, caller, params) {
    const quote = (name) => `"${name}"`;
    switch (policy.ownership) {
        case 'own': {
            params.push(requireDriverId(caller));
            return `${quote(policy.ownerColumn)} = $${params.length}`;
        }
        case 'own_or_unassigned': {
            params.push(requireDriverId(caller));
            const owner = quote(policy.ownerColumn);
            return `(${owner} = $${params.length} OR ${owner} IS NULL)`;
        }
        case 'via': {
            const via = policy.via;
            params.push(requireDriverId(caller));
            return (`${quote(via.column)} IN (SELECT ${quote(via.parentKey)} ` +
                `FROM ${quote(via.parentTable)} WHERE ${quote(via.parentOwnerColumn)} = $${params.length})`);
        }
        case 'unowned':
            return null;
    }
}
/** Combine the client's WHERE clause with the mandatory ownership predicate. */
function mergeWhere(clientWhere, ownership) {
    if (!ownership)
        return clientWhere;
    if (!clientWhere)
        return `WHERE ${ownership}`;
    return `${clientWhere} AND ${ownership}`;
}
/**
 * For 'via' tables an insert names its parent explicitly, so confirm the caller
 * owns that parent before the row is written.
 */
async function assertViaParentOwned(db, policy, caller, data) {
    if (policy.ownership !== 'via')
        return;
    const via = policy.via;
    const parentId = data[via.column];
    if (!parentId)
        throw new identity_1.AuthError(400, `${via.column} is required`);
    const owned = await db.query(`SELECT 1 FROM "${via.parentTable}"
      WHERE "${via.parentKey}" = $1 AND "${via.parentOwnerColumn}" = $2 LIMIT 1`, [parentId, requireDriverId(caller)]);
    if (!owned.rowCount)
        throw new identity_1.AuthError(403, 'Forbidden');
}
/**
 * Refuse a write that nothing scopes.
 *
 * A table with an ownership column is always narrowed by ownershipPredicate(),
 * so the worst a missing filter can do there is touch the caller's own rows. An
 * `unowned` table has no such predicate: an UPDATE that also carries no client
 * filter becomes an unqualified `UPDATE <table> SET ...`, rewriting every row in
 * the table for every driver. ocr_logs is the one table in that state today.
 *
 * Phase 2 gives ocr_logs a driver_id and it becomes a normal 'own' table; until
 * then, requiring a filter is what keeps a single request from clobbering the
 * whole scan history.
 */
function assertScopedWrite(policy, filters) {
    if (policy.ownership !== 'unowned')
        return;
    if (!filters?.length)
        throw new identity_1.AuthError(400, 'A filter is required for this table');
}
/**
 * SET fragments the server writes on its own, in addition to the sanitized
 * client payload.
 *
 * The right-hand side is a column reference, evaluated by PostgreSQL against the
 * row being updated. No client value reaches it, so nothing here can be forged
 * by anything in the request.
 */
function serverSetClauses(table, data) {
    // Settling a delivery pays the fare that was agreed when the job was created.
    // final_fare_inr is money and is absent from `writable` for that reason: a
    // driver must not be able to type in their own payout. Copying it from
    // proposed_fare_inr keeps the completion flow working without trusting the
    // browser with the number.
    if (table === 'delivery_requests' && data.status === 'delivered') {
        return ['"final_fare_inr" = "proposed_fare_inr"'];
    }
    return [];
}
function assertUpsertConflict(policy, onConflict) {
    // Upserting on a client-chosen key is how a caller would overwrite someone
    // else's row, so only the keys named in policy are accepted.
    if (!onConflict || !policy.upsertOn?.includes(onConflict)) {
        throw new identity_1.AuthError(403, 'Forbidden');
    }
    return onConflict;
}
const ALLOWED_UPLOAD_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
]);
/**
 * Pin every upload under the caller's own prefix. The key used to come straight
 * from the request, which let anyone write anywhere in the bucket.
 */
function safeUploadKey(caller, requestedKey, contentType) {
    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
        throw new identity_1.AuthError(400, 'Unsupported content type');
    }
    const driverId = requireDriverId(caller);
    const leaf = String(requestedKey ?? '')
        .split('/')
        .pop()
        .replace(/[^A-Za-z0-9._-]/g, '');
    if (!leaf || leaf.startsWith('.'))
        throw new identity_1.AuthError(400, 'Invalid key');
    return `drivers/${driverId}/${leaf}`;
}
