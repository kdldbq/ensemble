/**
 * Lightweight tracing primitive — I4.
 *
 * Defines a minimal Span / Tracer contract that maps cleanly onto
 * OpenTelemetry semantics WITHOUT pulling in the OTEL SDK.
 */

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void
  setStatus(status: 'ok' | 'error', message?: string): void
  recordException(err: Error): void
  end(): void
}

export interface Tracer {
  startSpan(name: string, attrs?: SpanAttributes): Span
  withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    attrs?: SpanAttributes,
  ): Promise<T>
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
