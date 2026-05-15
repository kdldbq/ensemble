/**
 * Shared db handle for integration tests.
 * DATABASE_URL is set by _globalSetup.ts before any test file runs.
 */
import { createDb, type Database } from '../../src/db/client'

export function getDbUrl(): string {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL not set — did _globalSetup.ts run?')
  return url
}

export const dbUrl: string = getDbUrl()
export const db: Database = createDb(dbUrl)
