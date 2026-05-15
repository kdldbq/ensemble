/**
 * Vitest globalSetup — runs ONCE before all test files (not per-file like setupFiles).
 * Starts a shared Testcontainers Postgres, runs migrations, and exposes
 * DATABASE_URL via process.env so integration tests can create their own db clients.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

let container: StartedPostgreSqlContainer

export async function setup() {
  container = await new PostgreSqlContainer('postgres:16').start()
  const url = container.getConnectionUri()
  process.env['DATABASE_URL'] = url

  const sql = postgres(url, { max: 1 })
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  await sql.end()
}

export async function teardown() {
  await container?.stop()
}
