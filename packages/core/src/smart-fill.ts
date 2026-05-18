/**
 * Smart fill — detect a pattern in a seed range and extend it (C2.2).
 *
 * Supports:
 *   - Arithmetic sequences (1, 2, 3 → 4, 5)
 *   - Geometric sequences (2, 4, 8 → 16, 32)
 *   - Date sequences (2026-01-01, 2026-01-02 → 2026-01-03 ...)
 *   - String + integer suffix ("Q1", "Q2" → "Q3")
 *   - Copy (fallback when no pattern detected)
 */

export type FillPattern =
  | { kind: 'arithmetic'; step: number }
  | { kind: 'geometric'; ratio: number }
  | { kind: 'date'; stepMs: number }
  | { kind: 'string-suffix'; prefix: string; start: number; step: number; width: number }
  | { kind: 'copy' }

function isNumericArray(values: unknown[]): values is number[] {
  return values.every((v) => typeof v === 'number' && Number.isFinite(v))
}

function isDateArray(values: unknown[]): values is Date[] {
  return values.every((v) => v instanceof Date && !Number.isNaN(v.getTime()))
}

function detectStringSuffix(
  values: string[],
): { prefix: string; start: number; step: number; width: number } | null {
  const parsed: Array<{ prefix: string; n: number; width: number }> = []
  for (const v of values) {
    const m = /^(.*?)(\d+)$/.exec(v)
    if (!m || m[2] === undefined) return null
    parsed.push({ prefix: m[1]!, n: Number(m[2]), width: m[2].length })
  }
  const prefix = parsed[0]?.prefix ?? ''
  if (!parsed.every((p) => p.prefix === prefix)) return null
  if (parsed.length < 2) return null
  const step = parsed[1]!.n - parsed[0]!.n
  for (let i = 2; i < parsed.length; i++) {
    if (parsed[i]!.n - parsed[i - 1]!.n !== step) return null
  }
  return {
    prefix,
    start: parsed[parsed.length - 1]!.n,
    step,
    width: parsed[0]!.width,
  }
}

export function detectFillPattern(seed: unknown[]): FillPattern {
  if (seed.length < 2) return { kind: 'copy' }

  if (isNumericArray(seed)) {
    const step = seed[1]! - seed[0]!
    let arithOk = true
    for (let i = 2; i < seed.length; i++) {
      if (seed[i]! - seed[i - 1]! !== step) {
        arithOk = false
        break
      }
    }
    if (arithOk) return { kind: 'arithmetic', step }

    if (seed.every((n) => n !== 0)) {
      const ratio = seed[1]! / seed[0]!
      let geoOk = Number.isFinite(ratio)
      for (let i = 2; geoOk && i < seed.length; i++) {
        if (Math.abs(seed[i]! / seed[i - 1]! - ratio) > 1e-9) geoOk = false
      }
      if (geoOk) return { kind: 'geometric', ratio }
    }

    return { kind: 'copy' }
  }

  if (isDateArray(seed)) {
    const stepMs = seed[1]!.getTime() - seed[0]!.getTime()
    let dateOk = true
    for (let i = 2; i < seed.length; i++) {
      if (seed[i]!.getTime() - seed[i - 1]!.getTime() !== stepMs) {
        dateOk = false
        break
      }
    }
    if (dateOk) return { kind: 'date', stepMs }
    return { kind: 'copy' }
  }

  if (seed.every((v) => typeof v === 'string')) {
    const suffix = detectStringSuffix(seed as string[])
    if (suffix) return { kind: 'string-suffix', ...suffix }
  }

  return { kind: 'copy' }
}

export function extendFill(seed: unknown[], targetCount: number): unknown[] {
  if (targetCount <= 0) return []
  const pattern = detectFillPattern(seed)
  const out: unknown[] = []

  switch (pattern.kind) {
    case 'arithmetic': {
      const last = (seed[seed.length - 1] as number) ?? 0
      for (let i = 0; i < targetCount; i++) {
        out.push(last + pattern.step * (i + 1))
      }
      return out
    }
    case 'geometric': {
      const last = (seed[seed.length - 1] as number) ?? 0
      for (let i = 0; i < targetCount; i++) {
        out.push(last * pattern.ratio ** (i + 1))
      }
      return out
    }
    case 'date': {
      const last = seed[seed.length - 1] as Date
      for (let i = 0; i < targetCount; i++) {
        out.push(new Date(last.getTime() + pattern.stepMs * (i + 1)))
      }
      return out
    }
    case 'string-suffix': {
      const { prefix, start, step, width } = pattern
      for (let i = 0; i < targetCount; i++) {
        const n = start + step * (i + 1)
        out.push(`${prefix}${n.toString().padStart(width, '0')}`)
      }
      return out
    }
    case 'copy':
    default: {
      for (let i = 0; i < targetCount; i++) {
        out.push(seed[i % seed.length])
      }
      return out
    }
  }
}
