/**
 * Shared db handle for integration tests.
 * DATABASE_URL is set by _globalSetup.ts before any test file runs.
 *
 * db     — superuser connection (BYPASSRLS); use for seed inserts in test setup.
 * appDb  — app_user connection (no BYPASSRLS); use inside withTenant() so RLS fires.
 */
import { createDb, type Database } from '../../src/db/client'

export function getDbUrl(): string {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL not set — did _globalSetup.ts run?')
  return url
}

export function getAppDbUrl(): string {
  const url = process.env['APP_DATABASE_URL']
  if (!url) throw new Error('APP_DATABASE_URL not set — did _globalSetup.ts run?')
  return url
}

export const dbUrl: string = getDbUrl()
export const db: Database = createDb(dbUrl)

export const appDbUrl: string = getAppDbUrl()
export const appDb: Database = createDb(appDbUrl)

export function redisUrl(): string {
  const url = process.env['REDIS_URL']
  if (!url) throw new Error('REDIS_URL not set — did _globalSetup.ts run?')
  return url
}
