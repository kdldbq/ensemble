/**
 * IPv4 + IPv6 allowlist check for D3 grant IP whitelisting.
 *
 * Supports:
 *   - Exact match: "203.0.113.5" / "2001:db8::1"
 *   - IPv4 CIDR: "10.0.0.0/8"
 *   - IPv6 CIDR: "2001:db8::/32"
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) + v
  }
  return n >>> 0
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  const parts = ip.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  if (head.length + tail.length > 8) return null
  const missing = 8 - head.length - tail.length
  const groups: string[] = [...head, ...Array<string>(missing).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const out = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    const g = groups[i]!
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    const v = Number.parseInt(g, 16)
    out[i * 2] = (v >> 8) & 0xff
    out[i * 2 + 1] = v & 0xff
  }
  return out
}

function isIpv4(ip: string): boolean {
  return ip.includes('.') && !ip.includes(':')
}

function matchIpv4(candidate: string, entry: string): boolean {
  const slash = entry.indexOf('/')
  const networkStr = slash === -1 ? entry : entry.slice(0, slash)
  const bits = slash === -1 ? 32 : Number.parseInt(entry.slice(slash + 1), 10)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const cInt = ipv4ToInt(candidate)
  const nInt = ipv4ToInt(networkStr)
  if (cInt === null || nInt === null) return false
  if (bits === 0) return true
  const mask = (~0 << (32 - bits)) >>> 0
  return (cInt & mask) === (nInt & mask)
}

function matchIpv6(candidate: string, entry: string): boolean {
  const slash = entry.indexOf('/')
  const networkStr = slash === -1 ? entry : entry.slice(0, slash)
  const bits = slash === -1 ? 128 : Number.parseInt(entry.slice(slash + 1), 10)
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false
  const cBytes = ipv6ToBytes(candidate)
  const nBytes = ipv6ToBytes(networkStr)
  if (!cBytes || !nBytes) return false
  const fullBytes = Math.floor(bits / 8)
  for (let i = 0; i < fullBytes; i++) {
    if (cBytes[i] !== nBytes[i]) return false
  }
  const remBits = bits % 8
  if (remBits === 0) return true
  const mask = (0xff << (8 - remBits)) & 0xff
  return ((cBytes[fullBytes]! ^ nBytes[fullBytes]!) & mask) === 0
}

export function ipMatches(candidate: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false
  const candIsV4 = isIpv4(candidate)
  for (const entry of allowed) {
    const entryIsV4 = isIpv4(entry.split('/')[0]!)
    if (candIsV4 !== entryIsV4) continue
    if (candIsV4) {
      if (matchIpv4(candidate, entry)) return true
    } else {
      if (matchIpv6(candidate, entry)) return true
    }
  }
  return false
}

export interface ClientIpOpts {
  /**
   * Trust the FIRST entry of `X-Forwarded-For` as the real client IP. Only
   * enable this when your reverse proxy (nginx, ALB, Cloudflare, etc.) STRIPS
   * client-supplied XFF and reinserts it itself — otherwise attackers can
   * spoof IP by sending their own XFF header. Default `false`.
   */
  trustXForwardedFor?: boolean
}

/**
 * Extract the client IP from a Hono request.
 *
 * Security: by default this does NOT trust `X-Forwarded-For` — that header is
 * attacker-controlled unless the edge proxy strips and reinserts it. Pass
 * `{ trustXForwardedFor: true }` only when your edge proxy is configured to
 * sanitize XFF (nginx `real_ip_header` + `real_ip_recursive`, ALB targets in
 * IP mode, Cloudflare with restricted-IP firewall rule, etc.).
 *
 * `X-Real-IP` is trusted because it is conventionally set by edge proxies
 * (never the client). If your edge does not set it, don't pass it through.
 */
export function clientIpFromHeaders(headers: Headers, opts: ClientIpOpts = {}): string | null {
  if (opts.trustXForwardedFor) {
    const xff = headers.get('x-forwarded-for')
    if (xff) {
      const first = xff.split(',')[0]?.trim()
      if (first) return first
    }
  }
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return null
}
