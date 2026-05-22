"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const pg_1 = require("pg");
// ── Config ────────────────────────────────────────────────────────────────────
const REGION = 'ap-northeast-1';
const DB_HOST = 'deliveryawsstack-deliverydb7f90b8e0-zsdbo8tjfdwa.cne8momiezva.ap-northeast-1.rds.amazonaws.com';
const SECRET_ARN = 'arn:aws:secretsmanager:ap-northeast-1:093452070570:secret:delivery/aurora/credentials-wCM7C2';
const S3_BUCKET = 'delivery-app-pan-documents';
const VALID_TABLES = new Set([
    'driver_profiles',
    'gps_delivery_summary',
    'gps_track_points',
    'driver_shifts',
    'delivery_requests',
    'request_notifications',
    'ocr_logs',
]);
const RESPONSE_HEADERS = {
    'Content-Type': 'application/json',
};
// ── AWS clients ───────────────────────────────────────────────────────────────
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({ region: REGION });
const s3Client = new client_s3_1.S3Client({ region: REGION });
// ── DB connection pool (reused across warm invocations) ───────────────────────
let pool = null;
async function getPool() {
    if (pool)
        return pool;
    // Prefer env vars (set when Lambda runs inside a VPC without Secrets Manager endpoint)
    const envUser = process.env.DB_USER;
    const envPassword = process.env.DB_PASSWORD;
    const envDatabase = process.env.DB_NAME;
    const envPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;
    let user, password, database, port;
    if (envUser && envPassword) {
        user = envUser;
        password = envPassword;
        database = envDatabase ?? 'postgres';
        port = envPort ?? 5432;
    }
    else {
        // Fallback: retrieve from Secrets Manager (requires VPC endpoint or NAT gateway)
        const { SecretString } = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: SECRET_ARN }));
        const creds = JSON.parse(SecretString);
        user = creds.username;
        password = creds.password;
        database = creds.dbname ?? 'postgres';
        port = creds.port ?? 5432;
    }
    pool = new pg_1.Pool({
        host: process.env.DB_HOST ?? DB_HOST,
        port,
        database,
        user,
        password,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
    return pool;
}
function col(name) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(name))
        throw new Error(`Invalid identifier: ${name}`);
    return `"${name}"`;
}
function buildWhere(filters, params) {
    if (!filters.length)
        return '';
    const parts = filters.map(({ column, op, value }) => {
        if (op === 'not_is_null')
            return `${col(column)} IS NOT NULL`;
        if (op === 'is_null')
            return `${col(column)} IS NULL`;
        params.push(value);
        if (op === 'eq')
            return `${col(column)} = $${params.length}`;
        if (op === 'gte')
            return `${col(column)} >= $${params.length}`;
        if (op === 'lte')
            return `${col(column)} <= $${params.length}`;
        throw new Error(`Unknown filter op: ${op}`);
    });
    return `WHERE ${parts.join(' AND ')}`;
}
function parseColumns(columns) {
    if (!columns || columns === '*')
        return '*';
    return columns.split(',').map(c => col(c.trim())).join(', ');
}
async function handleQuery(payload) {
    const { table, operation, columns, filters = [], data, onConflict, single, orderBy, countExact, headOnly, } = payload;
    if (!VALID_TABLES.has(table)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid table name' }) };
    }
    const db = await getPool();
    const params = [];
    // ── SELECT ────────────────────────────────────────────────────────────────
    if (operation === 'select') {
        const selectExpr = countExact ? 'COUNT(*) AS count' : parseColumns(columns ?? '*');
        const where = buildWhere(filters, params);
        const order = orderBy
            ? `ORDER BY ${col(orderBy.column)} ${orderBy.ascending ? 'ASC' : 'DESC'}`
            : '';
        const limit = single ? 'LIMIT 1' : '';
        const sql = [`SELECT ${selectExpr}`, `FROM "${table}"`, where, order, limit]
            .filter(Boolean).join(' ');
        const result = await db.query(sql, params);
        if (countExact || headOnly) {
            const count = parseInt(result.rows[0]?.count ?? '0', 10);
            return ok({ count, data: null, error: null });
        }
        const responseData = single ? (result.rows[0] ?? null) : result.rows;
        return ok({ data: responseData, error: null });
    }
    // ── INSERT ────────────────────────────────────────────────────────────────
    if (operation === 'insert') {
        if (!data)
            return { statusCode: 400, body: JSON.stringify({ error: 'No data' }) };
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`);
        params.push(...values);
        const returning = columns ? `RETURNING ${parseColumns(columns)}` : 'RETURNING *';
        const sql = `INSERT INTO "${table}" (${keys.map(col).join(', ')}) VALUES (${placeholders.join(', ')}) ${returning}`;
        const result = await db.query(sql, params);
        const responseData = single ? (result.rows[0] ?? null) : result.rows;
        return ok({ data: responseData, error: null });
    }
    // ── UPSERT ────────────────────────────────────────────────────────────────
    if (operation === 'upsert') {
        if (!data || !onConflict) {
            return { statusCode: 400, body: JSON.stringify({ error: 'upsert requires data and onConflict' }) };
        }
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`);
        // Non-conflict columns use EXCLUDED for the DO UPDATE SET clause
        const updateCols = keys.filter(k => k !== onConflict);
        const updateSet = updateCols.map(k => `${col(k)} = EXCLUDED.${col(k)}`).join(', ');
        params.push(...values);
        const returning = columns ? `RETURNING ${parseColumns(columns)}` : 'RETURNING *';
        const sql = [
            `INSERT INTO "${table}" (${keys.map(col).join(', ')}) VALUES (${placeholders.join(', ')})`,
            `ON CONFLICT (${col(onConflict)}) DO UPDATE SET ${updateSet}`,
            returning,
        ].join(' ');
        const result = await db.query(sql, params);
        const responseData = single ? (result.rows[0] ?? null) : result.rows;
        return ok({ data: responseData, error: null });
    }
    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (operation === 'update') {
        if (!data)
            return { statusCode: 400, body: JSON.stringify({ error: 'No data' }) };
        const setClauses = Object.entries(data).map(([k, v]) => {
            params.push(v);
            return `${col(k)} = $${params.length}`;
        });
        const where = buildWhere(filters, params);
        const sql = `UPDATE "${table}" SET ${setClauses.join(', ')} ${where}`.trim();
        await db.query(sql, params);
        return ok({ data: null, error: null });
    }
    // ── DELETE ────────────────────────────────────────────────────────────────
    if (operation === 'delete') {
        if (!filters.length) {
            return { statusCode: 400, body: JSON.stringify({ error: 'delete requires at least one filter' }) };
        }
        const where = buildWhere(filters, params);
        const sql = `DELETE FROM "${table}" ${where}`.trim();
        await db.query(sql, params);
        return ok({ data: null, error: null });
    }
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown operation' }) };
}
// ── Storage: pre-signed upload URL ───────────────────────────────────────────
async function handleUploadUrl(body) {
    const command = new client_s3_1.PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: body.key,
        ContentType: body.contentType,
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn: 300 });
    return ok({ uploadUrl });
}
// ── Realtime: polling endpoint ────────────────────────────────────────────────
async function handleRealtimePoll(body) {
    const { table, filter, since } = body;
    if (!VALID_TABLES.has(table)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid table' }) };
    }
    const db = await getPool();
    const params = [since];
    let sql = `SELECT * FROM "${table}" WHERE created_at > $1`;
    // Parse Supabase-style filter: "driver_id=eq.some-uuid"
    if (filter) {
        const match = filter.match(/^(\w+)=eq\.(.+)$/);
        if (match) {
            const [, column, value] = match;
            if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid filter column' }) };
            }
            params.push(value);
            sql += ` AND "${column}" = $${params.length}`;
        }
    }
    sql += ' ORDER BY created_at ASC LIMIT 20';
    const result = await db.query(sql, params);
    return ok({ rows: result.rows });
}
// ── Response helpers ──────────────────────────────────────────────────────────
function ok(body) {
    return { statusCode: 200, body: JSON.stringify(body) };
}
function err(statusCode, message) {
    return { statusCode, body: JSON.stringify({ error: message }) };
}
// ── Lambda entry point ────────────────────────────────────────────────────────
const handler = async (event) => {
    const rawPath = event.path ?? event.rawPath ?? '/';
    const stage = event.requestContext?.stage;
    // HTTP API v2 with named stage includes the stage prefix in rawPath (/prod/query → /query)
    const path = (stage && rawPath.startsWith(`/${stage}/`))
        ? rawPath.slice(stage.length + 1)
        : rawPath;
    const method = event.httpMethod ?? event.requestContext?.http?.method ?? 'POST';
    // OPTIONS preflight is handled by Function URL CORS config before Lambda is invoked.
    // This branch is a safety fallback only.
    if (method === 'OPTIONS') {
        return { statusCode: 200, headers: RESPONSE_HEADERS, body: '' };
    }
    let result;
    try {
        const body = event.body
            ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
            : {};
        if (path === '/query' && method === 'POST') {
            result = await handleQuery(body);
        }
        else if (path === '/storage/upload-url' && method === 'POST') {
            result = await handleUploadUrl(body);
        }
        else if (path === '/realtime/poll' && method === 'POST') {
            result = await handleRealtimePoll(body);
        }
        else {
            result = err(404, `Not found: ${method} ${path}`);
        }
    }
    catch (e) {
        console.error('Handler error:', e);
        result = err(500, 'Internal server error');
    }
    const { statusCode, body } = result;
    return { statusCode, headers: RESPONSE_HEADERS, body };
};
exports.handler = handler;
