import { describe, expect, it, vi } from 'vitest'
import { JwksCache } from '../src/jwks-cache'

const sampleJwks = {
  keys: [
    { kid: 'key-1', kty: 'RSA', n: 'a', e: 'AQAB', alg: 'RS256', use: 'sig' },
    { kid: 'key-2', kty: 'RSA', n: 'b', e: 'AQAB', alg: 'RS256', use: 'sig' },
  ],
}

function makeFetch(handler: () => Response) {
  return vi.fn(async () => handler())
}

describe('JwksCache', () => {
  it('fetches once and caches', async () => {
    const fetch = makeFetch(() => new Response(JSON.stringify(sampleJwks), { status: 200 }))
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch })
    await cache.getKey('key-1')
    await cache.getKey('key-2')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('force-refreshes on kid miss', async () => {
    let call = 0
    const fetch = makeFetch(() => {
      call += 1
      if (call === 1)
        return new Response(JSON.stringify({ keys: [sampleJwks.keys[0]] }), { status: 200 })
      return new Response(JSON.stringify(sampleJwks), { status: 200 })
    })
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch })
    await cache.getKey('key-1')
    const k2 = await cache.getKey('key-2')
    expect(k2.kid).toBe('key-2')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after refresh if kid still missing', async () => {
    const fetch = makeFetch(
      () => new Response(JSON.stringify({ keys: [sampleJwks.keys[0]] }), { status: 200 }),
    )
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch })
    await expect(cache.getKey('unknown-kid')).rejects.toThrow(/kid/i)
  })

  it('respects TTL', async () => {
    vi.useFakeTimers()
    const fetch = makeFetch(() => new Response(JSON.stringify(sampleJwks), { status: 200 }))
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch, ttlMs: 60_000 })
    await cache.getKey('key-1')
    vi.advanceTimersByTime(60_001)
    await cache.getKey('key-1')
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
