/**
 * OAuth 2.0 Authorization Code adapter — H5.
 *
 * Lets hosts wire ensemble against external IdPs (Google, GitHub, Okta,
 * Azure AD, custom) using OAuth 2.0 + PKCE.
 */

export interface OAuthProviderConfig {
  name: string
  clientId: string
  /** Authorization endpoint (e.g. https://accounts.google.com/o/oauth2/v2/auth) */
  authorizeUrl: string
  /** Token exchange endpoint */
  tokenUrl: string
  userInfoUrl?: string
  /** Space-separated scopes; default 'openid email profile'. */
  scope?: string
}

export interface OAuthState {
  state: string
  codeVerifier: string
  redirectAfter: string
}

export interface OAuthIdentity {
  externalSub: string
  email?: string
  displayName?: string
  tenantId: string
}

export interface OAuthAdapter {
  listProviders(): OAuthProviderConfig[]
  exchangeCode(input: {
    provider: string
    code: string
    state: OAuthState
  }): Promise<OAuthIdentity>
}

export class NotImplementedOAuthAdapter implements OAuthAdapter {
  listProviders(): OAuthProviderConfig[] {
    return []
  }
  async exchangeCode(): Promise<OAuthIdentity> {
    throw new Error('OAuthAdapter not implemented — host must provide one via createServer.oauth')
  }
}
