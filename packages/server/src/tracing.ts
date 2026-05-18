/**
 * Lightweight tracing primitive — I4.
 *
 * Defines a minimal Span / Tracer contract that maps cleanly onto
 * OpenTelemetry semantics WITHOUT pulling in the OTEL SDK.
 *
 * Trace context propagates via node:async_hooks AsyncLocalStorage: every
 * `traced(...)` (or tracer.withSpan(...)) call reads the surrounding trace
 * id from ALS, generates its own span id, and runs the user callback inside
 * a fresh ALS scope so any nested traced() inherits the trace and points
 * its parentSpanId at this span. Without ALS, sibling spans land in
 * different traces and the collector can't reconstruct the request.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined
}

interface TraceCtx {
  traceId: string
  /** spanId of the enclosing span; nested spans set their parentSpanId to this. */
  parentSpanId?: string
}

const traceCtx = new AsyncLocalStorage<TraceCtx>()

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void
  setStatus(status: 'ok' | 'error', message?: string): void
  recordException(err: Error): void
  end(): void
}

export interface Tracer {
  startSpan(name: string, attrs?: SpanAttributes): Span
  withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T, attrs?: SpanAttributes): Promise<T>
}

class NoopSpan implements Span {
  setAttribute(): void {}
  setStatus(): void {}
  recordException(): void {}
  end(): void {}
}

const noopSpan = new NoopSpan()

class NoopTracer implements Tracer {
  startSpan(): Span {
    return noopSpan
  }
  async withSpan<T>(_name: string, fn: (span: Span) => Promise<T> | T): Promise<T> {
    return await fn(noopSpan)
  }
}

let globalTracer: Tracer = new NoopTracer()

export function setTracer(t: Tracer): void {
  globalTracer = t
}

export function getTracer(): Tracer {
  return globalTracer
}

export async function traced<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attrs?: SpanAttributes,
): Promise<T> {
  return globalTracer.withSpan(name, fn, attrs)
}

// ─── OTLP/HTTP exporter (I4 follow-up) ────────────────────────────────────────

export interface OtlpHttpTracerOpts {
  /** Full OTLP endpoint, e.g. http://collector:4318/v1/traces */
  endpoint: string
  /** Service name attribute on every span. */
  serviceName: string
  /** Bearer / API key header. */
  authorization?: string
  /** Auto-flush every N ms. Default 5000. Set 0 to disable. */
  flushIntervalMs?: number
  /** fetch impl override for tests. */
  fetch?: typeof fetch
}

interface RecordedSpan {
  name: string
  traceId: string
  spanId: string
  parentSpanId?: string
  startNs: number
  endNs: number
  attributes: SpanAttributes
  status: 'ok' | 'error'
  statusMessage?: string
  events: Array<{ ns: number; name: string; attrs?: SpanAttributes }>
}

interface InternalSpan {
  span: Span
  traceId: string
  spanId: string
}

export function createOtlpHttpTracer(
  opts: OtlpHttpTracerOpts,
): Tracer & { flush(): Promise<void> } {
  const buf: RecordedSpan[] = []
  const flushIntervalMs = opts.flushIntervalMs ?? 5000
  const fetchImpl = opts.fetch ?? fetch

  const startSpanInternal = (name: string, attrs?: SpanAttributes): InternalSpan => {
    const current = traceCtx.getStore()
    const traceId = current?.traceId ?? randomHex(32)
    const spanId = randomHex(16)
    const start = nowNs()
    const rec: RecordedSpan = {
      name,
      traceId,
      spanId,
      ...(current?.parentSpanId ? { parentSpanId: current.parentSpanId } : {}),
      startNs: start,
      endNs: start,
      attributes: { ...(attrs ?? {}) },
      status: 'ok',
      events: [],
    }
    const span: Span = {
      setAttribute(key, value) {
        rec.attributes[key] = value
      },
      setStatus(status, message) {
        rec.status = status
        if (message) rec.statusMessage = message
      },
      recordException(err) {
        rec.status = 'error'
        rec.statusMessage = err.message
        rec.events.push({
          ns: nowNs(),
          name: 'exception',
          attrs: { 'exception.message': err.message },
        })
      },
      end() {
        rec.endNs = nowNs()
        buf.push(rec)
      },
    }
    return { span, traceId, spanId }
  }

  const startSpan = (name: string, attrs?: SpanAttributes): Span =>
    startSpanInternal(name, attrs).span

  async function flush(): Promise<void> {
    if (buf.length === 0) return
    const batch = buf.splice(0, buf.length)
    const body = JSON.stringify(buildOtlpPayload(opts.serviceName, batch))
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (opts.authorization) headers.authorization = opts.authorization
    try {
      await fetchImpl(opts.endpoint, { method: 'POST', headers, body })
    } catch (err) {
      if (buf.length < 5_000) {
        buf.unshift(...batch)
      } else {
        // Hard cap to avoid unbounded memory growth when the collector is down
        // for an extended period. Operators need to see this — silent drops
        // mean traces vanish and nobody notices the broken exporter.
        console.warn(
          `ensemble.tracing: dropped ${batch.length} spans (buffer full, exporter unreachable)`,
          err,
        )
      }
    }
  }

  if (flushIntervalMs > 0) {
    // Node's setInterval returns a Timeout with .unref(); browser returns a
    // number. Only Node needs unref to avoid keeping the event loop alive.
    const handle = setInterval(() => {
      void flush()
    }, flushIntervalMs) as ReturnType<typeof setInterval>
    if (typeof handle === 'object' && typeof handle.unref === 'function') {
      handle.unref()
    }
  }

  return {
    startSpan,
    async withSpan<T>(
      name: string,
      fn: (span: Span) => Promise<T> | T,
      attrs?: SpanAttributes,
    ): Promise<T> {
      const { span, traceId, spanId } = startSpanInternal(name, attrs)
      // Nest the user callback inside an ALS scope so any traced() called
      // transitively inherits the current trace + parent. Without this, every
      // sibling span gets a fresh traceId and the collector can't tie them
      // back to the request.
      return traceCtx.run({ traceId, parentSpanId: spanId }, async () => {
        try {
          const out = await fn(span)
          span.setStatus('ok')
          return out
        } catch (err) {
          span.recordException(err instanceof Error ? err : new Error(String(err)))
          throw err
        } finally {
          span.end()
        }
      })
    },
    flush,
  }
}

function nowNs(): number {
  return Date.now() * 1_000_000
}

function buildOtlpPayload(serviceName: string, spans: RecordedSpan[]): unknown {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
        },
        scopeSpans: [
          {
            scope: { name: 'ensemble-sheets', version: '0.2' },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
              name: s.name,
              kind: 1,
              startTimeUnixNano: s.startNs.toString(),
              endTimeUnixNano: s.endNs.toString(),
              attributes: Object.entries(s.attributes)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => ({ key: k, value: toAnyValue(v) })),
              status: { code: s.status === 'ok' ? 1 : 2, message: s.statusMessage ?? '' },
              events: s.events.map((e) => ({
                timeUnixNano: e.ns.toString(),
                name: e.name,
                attributes: e.attrs
                  ? Object.entries(e.attrs).map(([k, v]) => ({ key: k, value: toAnyValue(v) }))
                  : [],
              })),
            })),
          },
        ],
      },
    ],
  }
}

function toAnyValue(v: string | number | boolean | undefined): unknown {
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { boolValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { intValue: v } : { doubleValue: v }
  return { stringValue: '' }
}

function randomHex(len: number): string {
  let out = ''
  while (out.length < len) {
    out += Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0')
  }
  return out.slice(0, len)
}
