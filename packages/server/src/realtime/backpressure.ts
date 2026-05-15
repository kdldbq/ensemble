/**
 * TokenBucket interface — placeholder until T15 implements createTokenBucket.
 * T15 will add createTokenBucket() here; server.ts currently passes { take: () => true }.
 */
export interface TokenBucket {
  take(): boolean
}
