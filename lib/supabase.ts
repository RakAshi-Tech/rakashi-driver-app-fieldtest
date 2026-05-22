/**
 * AWS API Gateway wrapper providing a Supabase-compatible interface.
 * Replaces @supabase/supabase-js — existing call sites need no changes.
 *
 * DB queries   → POST {API_URL}/query         → Lambda → Aurora RDS
 * Storage      → POST {API_URL}/storage/upload-url → Lambda → S3 pre-signed URL
 * Realtime     → polling every 5s via {API_URL}/realtime/poll
 */

const API_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL!
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ''
const S3_BASE = process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? ''

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function callApi<T = unknown>(path: string, body: unknown): Promise<T> {
  if (!API_URL) {
    console.error('[AWS] NEXT_PUBLIC_API_GATEWAY_URL is undefined — restart the dev server after editing .env.local')
    throw new Error('API_GATEWAY_URL not configured')
  }
  const url = `${API_URL}${path}`
  console.debug('[AWS] →', url)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'x-api-key': API_KEY }),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[AWS] ${res.status} ${url}`, text)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterOp = 'eq' | 'gte' | 'lte' | 'not_is_null' | 'is_null'

interface Filter {
  column: string
  op: FilterOp
  value?: unknown
}

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
}

interface ApiResult<T = unknown> {
  data: T | null
  error: { message: string } | null
  count?: number
}

// ── Select query builder ──────────────────────────────────────────────────────

class SelectBuilder<T = unknown> {
  protected payload: QueryPayload

  constructor(table: string) {
    this.payload = { table, operation: 'select' }
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    this.payload.columns = columns
    if (opts?.count === 'exact') this.payload.countExact = true
    if (opts?.head) this.payload.headOnly = true
    return this
  }

  eq(column: string, value: unknown): this {
    this.payload.filters = [...(this.payload.filters ?? []), { column, op: 'eq', value }]
    return this
  }

  gte(column: string, value: unknown): this {
    this.payload.filters = [...(this.payload.filters ?? []), { column, op: 'gte', value }]
    return this
  }

  not(column: string, _op: string, _value: unknown): this {
    this.payload.filters = [...(this.payload.filters ?? []), { column, op: 'not_is_null' }]
    return this
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.payload.orderBy = { column, ascending: opts?.ascending ?? true }
    return this
  }

  single(): Promise<ApiResult<T>> {
    this.payload.single = true
    return callApi<ApiResult<T>>('/query', this.payload)
  }

  then<R>(
    resolve: (value: ApiResult<T>) => R,
    reject?: (reason: unknown) => R
  ): Promise<R> {
    return callApi<ApiResult<T>>('/query', this.payload).then(resolve, reject)
  }
}

// ── Mutation builder (insert / upsert / update) ───────────────────────────────

class MutationBuilder<T = unknown> {
  protected payload: QueryPayload

  constructor(
    table: string,
    operation: 'insert' | 'upsert' | 'update',
    data: Record<string, unknown>,
    onConflict?: string
  ) {
    this.payload = { table, operation, data, ...(onConflict && { onConflict }) }
  }

  eq(column: string, value: unknown): this {
    this.payload.filters = [...(this.payload.filters ?? []), { column, op: 'eq', value }]
    return this
  }

  select(columns = '*'): this {
    this.payload.columns = columns
    return this
  }

  single(): Promise<ApiResult<T>> {
    this.payload.single = true
    return callApi<ApiResult<T>>('/query', this.payload)
  }

  then<R>(
    resolve: (value: ApiResult<T>) => R,
    reject?: (reason: unknown) => R
  ): Promise<R> {
    return callApi<ApiResult<T>>('/query', this.payload).then(resolve, reject)
  }
}

// ── Delete builder ────────────────────────────────────────────────────────────

class DeleteBuilder<T = unknown> {
  private payload: QueryPayload

  constructor(table: string) {
    this.payload = { table, operation: 'delete' }
  }

  eq(column: string, value: unknown): this {
    this.payload.filters = [...(this.payload.filters ?? []), { column, op: 'eq', value }]
    return this
  }

  then<R>(
    resolve: (value: ApiResult<T>) => R,
    reject?: (reason: unknown) => R
  ): Promise<R> {
    return callApi<ApiResult<T>>('/query', this.payload).then(resolve, reject)
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────

class StorageBucket {
  constructor(private bucket: string) {}

  async upload(
    path: string,
    file: File,
    opts?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
    try {
      const contentType = opts?.contentType ?? file.type
      const { uploadUrl } = await callApi<{ uploadUrl: string }>(
        '/storage/upload-url',
        { bucket: this.bucket, key: path, contentType }
      )
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': contentType },
      })
      return { data: { path }, error: null }
    } catch (err) {
      return { data: null, error: { message: String(err) } }
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const base = S3_BASE || `https://delivery-app-pan-documents.s3.ap-northeast-1.amazonaws.com`
    return { data: { publicUrl: `${base}/${path}` } }
  }
}

class StorageClient {
  from(bucket: string) {
    return new StorageBucket(bucket)
  }
}

// ── Realtime channel (polling-based) ─────────────────────────────────────────

type RealtimeHandler = (payload: { new: Record<string, unknown> }) => void

class RealtimeChannel {
  private handlers: RealtimeHandler[] = []
  private tableConfig: { table: string; filter?: string } | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastCheckedAt = new Date().toISOString()

  on(
    _event: string,
    config: { table: string; filter?: string; schema?: string; event?: string },
    handler: RealtimeHandler
  ): this {
    this.tableConfig = { table: config.table, filter: config.filter }
    this.handlers.push(handler)
    return this
  }

  subscribe(): this {
    if (!this.tableConfig) return this
    const { table, filter } = this.tableConfig

    this.intervalId = setInterval(async () => {
      try {
        const result = await callApi<{ rows: Record<string, unknown>[] }>(
          '/realtime/poll',
          { table, filter, since: this.lastCheckedAt }
        )
        if (result.rows?.length) {
          this.lastCheckedAt = new Date().toISOString()
          for (const row of result.rows) {
            for (const handler of this.handlers) {
              handler({ new: row })
            }
          }
        }
      } catch (err) {
        console.error('[Realtime] poll error:', err)
      }
    }, 5000)

    return this
  }

  unsubscribe() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

// ── Main client ───────────────────────────────────────────────────────────────

class SupabaseAWSClient {
  readonly storage = new StorageClient()
  private channels = new Map<string, RealtimeChannel>()

  from(table: string) {
    return {
      select: (columns = '*', opts?: { count?: 'exact'; head?: boolean }) =>
        new SelectBuilder(table).select(columns, opts),
      insert: (data: Record<string, unknown>) =>
        new MutationBuilder(table, 'insert', data),
      upsert: (data: Record<string, unknown>, opts?: { onConflict?: string }) =>
        new MutationBuilder(table, 'upsert', data, opts?.onConflict),
      update: (data: Record<string, unknown>) =>
        new MutationBuilder(table, 'update', data),
      delete: () =>
        new DeleteBuilder(table),
    }
  }

  channel(name: string): RealtimeChannel {
    const ch = new RealtimeChannel()
    this.channels.set(name, ch)
    return ch
  }

  removeChannel(channel: RealtimeChannel) {
    channel.unsubscribe()
    for (const [key, ch] of this.channels) {
      if (ch === channel) {
        this.channels.delete(key)
        break
      }
    }
  }
}

export const supabase = new SupabaseAWSClient()
