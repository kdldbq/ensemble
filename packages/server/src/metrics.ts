/**
 * Lightweight Prometheus-compatible metrics registry (I3).
 *
 * Zero deps — just std lib. Avoids pulling in the full @opentelemetry/api +
 * sdk-node tree. Hosts that want OTLP push can re-export via the OTEL SDK's
 * MeterProvider; this registry is the in-process source of truth.
 */

type LabelSet = Record<string, string>

function labelKey(labels: LabelSet): string {
  const keys = Object.keys(labels).sort()
  return keys.map((k) => `${k}=${labels[k]}`).join(',')
}

function formatLabels(labels: LabelSet): string {
  const entries = Object.entries(labels)
  if (entries.length === 0) return ''
  return `{${entries.map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`).join(',')}}`
}

class Counter {
  private values = new Map<string, { labels: LabelSet; value: number }>()

  constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  inc(labels: LabelSet = {}, n = 1): void {
    const k = labelKey(labels)
    const entry = this.values.get(k)
    if (entry) entry.value += n
    else this.values.set(k, { labels, value: n })
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`]
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${formatLabels(labels)} ${value}`)
    }
    return lines.join('\n')
  }
}

class Gauge {
  private values = new Map<string, { labels: LabelSet; value: number }>()

  constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  set(labels: LabelSet, value: number): void {
    this.values.set(labelKey(labels), { labels, value })
  }

  inc(labels: LabelSet = {}, n = 1): void {
    const k = labelKey(labels)
    const entry = this.values.get(k)
    if (entry) entry.value += n
    else this.values.set(k, { labels, value: n })
  }

  dec(labels: LabelSet = {}, n = 1): void {
    this.inc(labels, -n)
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`]
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${formatLabels(labels)} ${value}`)
    }
    return lines.join('\n')
  }
}

class Histogram {
  private series = new Map<
    string,
    { labels: LabelSet; buckets: Map<number, number>; sum: number; count: number }
  >()

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ) {}

  observe(labels: LabelSet, value: number): void {
    const k = labelKey(labels)
    let entry = this.series.get(k)
    if (!entry) {
      entry = { labels, buckets: new Map(), sum: 0, count: 0 }
      for (const b of this.buckets) entry.buckets.set(b, 0)
      this.series.set(k, entry)
    }
    entry.sum += value
    entry.count += 1
    for (const b of this.buckets) {
      if (value <= b) entry.buckets.set(b, (entry.buckets.get(b) ?? 0) + 1)
    }
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`]
    for (const { labels, buckets, sum, count } of this.series.values()) {
      for (const b of this.buckets) {
        const labelStr = formatLabels({ ...labels, le: b.toString() })
        lines.push(`${this.name}_bucket${labelStr} ${buckets.get(b) ?? 0}`)
      }
      lines.push(`${this.name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${count}`)
      lines.push(`${this.name}_sum${formatLabels(labels)} ${sum}`)
      lines.push(`${this.name}_count${formatLabels(labels)} ${count}`)
    }
    return lines.join('\n')
  }
}

class Registry {
  private metrics: Array<Counter | Gauge | Histogram> = []

  counter(name: string, help: string): Counter {
    const c = new Counter(name, help)
    this.metrics.push(c)
    return c
  }
  gauge(name: string, help: string): Gauge {
    const g = new Gauge(name, help)
    this.metrics.push(g)
    return g
  }
  histogram(name: string, help: string, buckets?: number[]): Histogram {
    const h = new Histogram(name, help, buckets)
    this.metrics.push(h)
    return h
  }

  render(): string {
    return this.metrics.map((m) => m.render()).join('\n\n')
  }
}

export const registry = new Registry()

// ─── Standard ensemble metrics ───────────────────────────────────────────
export const httpRequestsTotal = registry.counter(
  'ensemble_http_requests_total',
  'Total HTTP requests by method + path prefix + status class',
)

export const httpRequestDurationSeconds = registry.histogram(
  'ensemble_http_request_duration_seconds',
  'HTTP request duration in seconds',
)

export const wsConnectionsActive = registry.gauge(
  'ensemble_ws_connections_active',
  'Currently active WebSocket connections',
)

export const wsConnectionsTotal = registry.counter(
  'ensemble_ws_connections_total',
  'Total WebSocket connections opened',
)

export const mutationsTotal = registry.counter(
  'ensemble_mutations_total',
  'Total mutations applied to workbooks',
)

export const cellLockHitsTotal = registry.counter(
  'ensemble_cell_lock_hits_total',
  'Cell-region lock acquire outcomes (granted vs denied)',
)

export const auditEventsTotal = registry.counter(
  'ensemble_audit_events_total',
  'Audit log entries written by event type',
)
