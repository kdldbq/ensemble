import { describe, expect, it } from 'vitest'
import { createOtlpHttpTracer, setTracer, traced } from '../../src/tracing'

interface OtlpSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
}

function parseSpans(body: string): OtlpSpan[] {
  const json = JSON.parse(body) as {
    resourceSpans: Array<{
      scopeSpans: Array<{
        spans: Array<{ traceId: string; spanId: string; parentSpanId?: string; name: string }>
      }>
    }>
  }
  return json.resourceSpans.flatMap((rs) =>
    rs.scopeSpans.flatMap((ss) =>
      ss.spans.map((s) => ({
        traceId: s.traceId,
        spanId: s.spanId,
        parentSpanId: s.parentSpanId,
        name: s.name,
      })),
    ),
  )
}

function makeCapturingTracer() {
  const captured: Array<{ url: string; body: string }> = []
  const stubFetch = (async (url: string, init?: { body?: string }) => {
    captured.push({ url, body: init?.body ?? '' })
    return new Response('ok', { status: 200 })
  }) as unknown as typeof fetch
  const tracer = createOtlpHttpTracer({
    endpoint: 'http://stub/v1/traces',
    serviceName: 'ensemble-test',
    flushIntervalMs: 0, // disable auto-flush; we flush manually
    fetch: stubFetch,
  })
  return { tracer, captured }
}

describe('tracing — traceId propagation', () => {
  it('nested traced() calls share traceId, child has parentSpanId pointing at parent', async () => {
    const { tracer, captured } = makeCapturingTracer()
    setTracer(tracer)

    await traced('parent', async () => {
      await traced('child', async () => {
        /* no-op */
      })
    })

    await tracer.flush()
    expect(captured).toHaveLength(1)

    const spans = parseSpans(captured[0]!.body)
    const parent = spans.find((s) => s.name === 'parent')
    const child = spans.find((s) => s.name === 'child')
    expect(parent).toBeDefined()
    expect(child).toBeDefined()
    expect(parent!.traceId).toBe(child!.traceId)
    expect(child!.parentSpanId).toBe(parent!.spanId)
    expect(parent!.parentSpanId).toBeUndefined()
  })

  it('sibling traced() calls inside a parent share the parent traceId', async () => {
    const { tracer, captured } = makeCapturingTracer()
    setTracer(tracer)

    await traced('root', async () => {
      await traced('left', async () => {})
      await traced('right', async () => {})
    })

    await tracer.flush()
    const spans = parseSpans(captured[0]!.body)
    const root = spans.find((s) => s.name === 'root')!
    const left = spans.find((s) => s.name === 'left')!
    const right = spans.find((s) => s.name === 'right')!
    expect(left.traceId).toBe(root.traceId)
    expect(right.traceId).toBe(root.traceId)
    expect(left.parentSpanId).toBe(root.spanId)
    expect(right.parentSpanId).toBe(root.spanId)
    expect(left.spanId).not.toBe(right.spanId)
  })

  it('separate top-level traced() calls produce DIFFERENT traceIds', async () => {
    const { tracer, captured } = makeCapturingTracer()
    setTracer(tracer)

    await traced('first-request', async () => {})
    await traced('second-request', async () => {})

    await tracer.flush()
    const spans = parseSpans(captured[0]!.body)
    const a = spans.find((s) => s.name === 'first-request')!
    const b = spans.find((s) => s.name === 'second-request')!
    expect(a.traceId).not.toBe(b.traceId)
  })
})
