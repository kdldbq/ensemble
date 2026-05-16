import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { JwksIdentityAdapter } from '../src/index'

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  })
  const jwk = await exportJWK(publicKey)
  ;(jwk as { kid: string; alg: string; use: string }).kid = 'test-key'
  ;(jwk as { kid: string; alg: string; use: string }).alg = 'RS256'
  ;(jwk as { kid: string; alg: string; use: string }).use = 'sig'
  const jwks = { keys: [jwk] }
  const fetch = vi.fn(async () => new Response(JSON.stringify(jwks), { status: 200 }))
  return { privateKey, fetch }
}

async function sign(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('test-issuer')
    .setAudience('test-audience')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

describe('JwksIdentityAdapter', () => {
  it('returns IdentityContext from valid JWT', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks',
      issuer: 'test-issuer',
      audience: 'test-audience',
      fetch,
    })
    const token = await sign(privateKey, {
      sub: 'user-42',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      email: 'u@example.com',
      roles: ['teacher'],
    })
    const ctx = await adapter.resolveFromToken(token)
    expect(ctx).toEqual({
      tenantId: '11111111-1111-1111-1111-111111111111',
      userId: 'user-42',
      email: 'u@example.com',
      roles: ['teacher'],
    })
  })

  it('rejects expired JWT', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks',
      issuer: 'test-issuer',
      audience: 'test-audience',
      fetch,
    })
    const token = await new SignJWT({ sub: 'u', tenant_id: '22222222-2222-2222-2222-222222222222' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('test-issuer')
      .setAudience('test-audience')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/exp/i)
  })

  it('rejects wrong audience', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks',
      issuer: 'test-issuer',
      audience: 'test-audience',
      fetch,
    })
    const token = await new SignJWT({ sub: 'u', tenant_id: '33333333-3333-3333-3333-333333333333' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('test-issuer')
      .setAudience('wrong-aud')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/aud/i)
  })

  it('rejects missing tenant_id claim', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks',
      issuer: 'test-issuer',
      audience: 'test-audience',
      fetch,
    })
    const token = await sign(privateKey, { sub: 'u' })
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/tenant_id/i)
  })

  it('returns minimal IdentityContext when optional claims absent', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks',
      issuer: 'test-issuer',
      audience: 'test-audience',
      fetch,
    })
    const token = await sign(privateKey, {
      sub: 'minimal-user',
      tenant_id: '44444444-4444-4444-4444-444444444444',
    })
    const ctx = await adapter.resolveFromToken(token)
    expect(ctx).toEqual({
      tenantId: '44444444-4444-4444-4444-444444444444',
      userId: 'minimal-user',
    })
    expect(ctx.email).toBeUndefined()
    expect(ctx.displayName).toBeUndefined()
    expect(ctx.roles).toBeUndefined()
  })

  it('rejects when JWKS endpoint returns non-2xx', async () => {
    const fetch = vi.fn(async () => new Response('boom', { status: 500 }))
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks',
      issuer: 'test-issuer',
      audience: 'test-audience',
      fetch,
    })
    const { privateKey: pk } = await setup()
    const token = await sign(pk, { sub: 'u', tenant_id: '55555555-5555-5555-5555-555555555555' })
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/500|JwksCache/i)
  })
})
