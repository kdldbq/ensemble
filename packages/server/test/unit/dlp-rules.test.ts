import { describe, expect, it } from 'vitest'
import { DEFAULT_DLP_RULES, scanPayload, scanText } from '../../src/services/dlp-rules'

describe('DLP scanText', () => {
  it('detects valid Luhn credit card', () => {
    const findings = scanText('Card: 4242 4242 4242 4242')
    expect(findings.some((f) => f.ruleId === 'cc-pan')).toBe(true)
  })

  it('rejects Luhn-failing 16 digit string (no false positive)', () => {
    const findings = scanText('Random: 1234 1234 1234 1234')
    expect(findings.some((f) => f.ruleId === 'cc-pan')).toBe(false)
  })

  it('detects US SSN format', () => {
    const findings = scanText('SSN: 123-45-6789')
    expect(findings.some((f) => f.ruleId === 'us-ssn')).toBe(true)
  })

  it('detects email', () => {
    const findings = scanText('contact: alice@example.com')
    expect(findings.some((f) => f.ruleId === 'email')).toBe(true)
  })

  it('detects Chinese mobile', () => {
    const findings = scanText('打电话给 13912345678')
    expect(findings.some((f) => f.ruleId === 'cn-mobile')).toBe(true)
  })

  it('masks matched values with last-4 visible', () => {
    const findings = scanText('alice@example.com')
    const email = findings.find((f) => f.ruleId === 'email')
    expect(email?.masked).toMatch(/\*+\.com$/)
  })

  it('returns empty findings on clean text', () => {
    const findings = scanText('hello world')
    expect(findings).toEqual([])
  })

  it('respects custom rule set', () => {
    const customRules = DEFAULT_DLP_RULES.filter((r) => r.id === 'email')
    expect(scanText('alice@x.com 13912345678', customRules)).toHaveLength(1)
  })

  it('returns findings ordered by start offset', () => {
    const findings = scanText('alice@x.com bob@y.org')
    expect(findings.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i]!.start).toBeGreaterThan(findings[i - 1]!.start)
    }
  })
})

describe('DLP scanPayload', () => {
  it('walks nested objects', () => {
    const findings = scanPayload({
      user: { email: 'alice@example.com', notes: ['phone 13912345678'] },
    })
    const ruleIds = findings.map((f) => f.ruleId)
    expect(ruleIds).toContain('email')
    expect(ruleIds).toContain('cn-mobile')
  })

  it('skips short strings', () => {
    expect(scanPayload({ s: 'ab' })).toEqual([])
  })

  it('skips non-string leaves', () => {
    expect(scanPayload({ n: 42, b: true, nil: null })).toEqual([])
  })
})
