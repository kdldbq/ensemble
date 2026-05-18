import { describe, expect, it } from 'vitest'
import { clientIpFromHeaders, ipMatches } from '../../src/services/ip-allowlist'

describe('ipMatches', () => {
  it('matches IPv4 exact', () => {
    expect(ipMatches('203.0.113.5', ['203.0.113.5'])).toBe(true)
    expect(ipMatches('203.0.113.6', ['203.0.113.5'])).toBe(false)
  })

  it('matches IPv4 /24 CIDR', () => {
    expect(ipMatches('10.0.0.5', ['10.0.0.0/24'])).toBe(true)
    expect(ipMatches('10.0.1.5', ['10.0.0.0/24'])).toBe(false)
  })

  it('matches IPv4 /8 CIDR', () => {
    expect(ipMatches('10.255.255.255', ['10.0.0.0/8'])).toBe(true)
    expect(ipMatches('11.0.0.0', ['10.0.0.0/8'])).toBe(false)
  })

  it('matches IPv4 /0 (any)', () => {
    expect(ipMatches('1.2.3.4', ['0.0.0.0/0'])).toBe(true)
  })

  it('matches IPv4 /32 (single host)', () => {
    expect(ipMatches('1.2.3.4', ['1.2.3.4/32'])).toBe(true)
    expect(ipMatches('1.2.3.5', ['1.2.3.4/32'])).toBe(false)
  })

  it('rejects empty allowlist', () => {
    expect(ipMatches('1.2.3.4', [])).toBe(false)
  })

  it('IPv6 exact match', () => {
    expect(ipMatches('2001:db8::1', ['2001:db8::1'])).toBe(true)
  })

  it('IPv6 CIDR /32', () => {
    expect(ipMatches('2001:db8:abcd::1', ['2001:db8::/32'])).toBe(true)
    expect(ipMatches('2001:db9::1', ['2001:db8::/32'])).toBe(false)
  })

  it('mixed v4 + v6 allowlist', () => {
    const list = ['10.0.0.0/8', '2001:db8::/32']
    expect(ipMatches('10.5.5.5', list)).toBe(true)
    expect(ipMatches('2001:db8::beef', list)).toBe(true)
    expect(ipMatches('11.0.0.0', list)).toBe(false)
    expect(ipMatches('2001:db9::1', list)).toBe(false)
  })

  it('rejects malformed IPs', () => {
    expect(ipMatches('999.0.0.0', ['10.0.0.0/8'])).toBe(false)
    expect(ipMatches('not-an-ip', ['10.0.0.0/8'])).toBe(false)
  })

  it('rejects malformed CIDR', () => {
    expect(ipMatches('1.2.3.4', ['1.2.3.4/99'])).toBe(false)
    expect(ipMatches('1.2.3.4', ['1.2.3.4/-1'])).toBe(false)
  })
})

describe('clientIpFromHeaders', () => {
  it('returns first hop from X-Forwarded-For when trustXForwardedFor=true', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })
    expect(clientIpFromHeaders(h, { trustXForwardedFor: true })).toBe('203.0.113.5')
  })

  it('ignores X-Forwarded-For by default (secure default)', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })
    expect(clientIpFromHeaders(h)).toBeNull()
  })

  it('falls back to X-Real-IP', () => {
    const h = new Headers({ 'x-real-ip': '203.0.113.7' })
    expect(clientIpFromHeaders(h)).toBe('203.0.113.7')
  })

  it('returns null when no header present', () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull()
  })

  it('XFF takes precedence over X-Real-IP when trustXForwardedFor=true', () => {
    const h = new Headers({
      'x-forwarded-for': '203.0.113.5',
      'x-real-ip': '10.0.0.1',
    })
    expect(clientIpFromHeaders(h, { trustXForwardedFor: true })).toBe('203.0.113.5')
  })

  it('with trustXForwardedFor=false, X-Real-IP is used even when XFF present', () => {
    const h = new Headers({
      'x-forwarded-for': '203.0.113.5',
      'x-real-ip': '10.0.0.1',
    })
    expect(clientIpFromHeaders(h)).toBe('10.0.0.1')
  })

  it('trims whitespace in XFF when trusted', () => {
    const h = new Headers({ 'x-forwarded-for': '  203.0.113.5  , 10.0.0.1' })
    expect(clientIpFromHeaders(h, { trustXForwardedFor: true })).toBe('203.0.113.5')
  })
})
