/**
 * DLP (Data Loss Prevention) rule evaluator — L3.
 *
 * Scans cell values for sensitive patterns (credit cards, SSNs, emails,
 * Chinese ID numbers) and emits structured findings. Hosts wire results
 * into an alerting channel via the RiskAdapter contract.
 */

export interface DlpRule {
  id: string
  label: string
  severity: 'low' | 'medium' | 'high'
  pattern: RegExp
  validate?: (matched: string) => boolean
}

export interface DlpFinding {
  ruleId: string
  label: string
  severity: 'low' | 'medium' | 'high'
  /** Redacted match — last 4 chars visible, rest masked. */
  masked: string
  start: number
  end: number
}

function luhnValid(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (alt) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

function chineseIdValid(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkChars = '10X98765432'
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * weights[i]!
  const expected = checkChars[sum % 11]
  return id[17]!.toUpperCase() === expected
}

function maskMiddle(s: string, keepTail = 4): string {
  if (s.length <= keepTail) return '*'.repeat(s.length)
  return '*'.repeat(s.length - keepTail) + s.slice(-keepTail)
}

export const DEFAULT_DLP_RULES: DlpRule[] = [
  {
    id: 'cc-pan',
    label: 'Credit card number',
    severity: 'high',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: luhnValid,
  },
  {
    id: 'us-ssn',
    label: 'US Social Security number',
    severity: 'high',
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  },
  {
    id: 'cn-id',
    label: '中国身份证号',
    severity: 'high',
    pattern: /\b\d{17}[\dXx]\b/g,
    validate: chineseIdValid,
  },
  {
    id: 'email',
    label: 'Email address',
    severity: 'low',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: 'cn-mobile',
    label: '中国手机号',
    severity: 'medium',
    pattern: /\b1[3-9]\d{9}\b/g,
  },
  {
    id: 'iban',
    label: 'IBAN',
    severity: 'high',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
  },
]

export function scanText(text: string, rules: DlpRule[] = DEFAULT_DLP_RULES): DlpFinding[] {
  const findings: DlpFinding[] = []
  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.pattern.exec(text)) !== null) {
      const matched = m[0]
      if (rule.validate && !rule.validate(matched)) continue
      findings.push({
        ruleId: rule.id,
        label: rule.label,
        severity: rule.severity,
        masked: maskMiddle(matched),
        start: m.index,
        end: m.index + matched.length,
      })
      if (!rule.pattern.global) break
    }
  }
  findings.sort((a, b) => a.start - b.start)
  return findings
}

export function scanPayload(
  payload: unknown,
  rules: DlpRule[] = DEFAULT_DLP_RULES,
): DlpFinding[] {
  const out: DlpFinding[] = []
  function walk(v: unknown): void {
    if (typeof v === 'string') {
      if (v.length > 4 && v.length < 10_000) out.push(...scanText(v, rules))
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x)
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x)
    }
  }
  walk(payload)
  return out
}

/**
 * Pluggable risk-alert sink. Host wires Slack / OpsGenie / SIEM.
 */
export interface RiskAdapter {
  alert(input: {
    tenantId: string
    actorId: string
    workbookId?: string
    findings: DlpFinding[]
  }): Promise<void> | void
}

export class NoopRiskAdapter implements RiskAdapter {
  alert(): void {
    /* swallow — host opted out */
  }
}
