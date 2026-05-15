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

  // Create a non-privileged app_user role that is subject to RLS policies.
  // The seed client (DATABASE_URL / superuser) can insert cross-tenant data;
  // APP_DATABASE_URL connects as app_user so withTenant() transactions are
  // gated by RLS. Production code uses the equivalent of app_user.
  const sqlClient = postgres(url, { max: 1 })
  await sqlClient`CREATE ROLE app_user LOGIN PASSWORD 'app_user'`
  await sqlClient`GRANT CONNECT ON DATABASE ${sqlClient(new URL(url).pathname.slice(1))} TO app_user`
  await sqlClient`GRANT USAGE ON SCHEMA public TO app_user`
  await sqlClient`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`
  await sqlClient.end()

  const appUrl = new URL(url)
  appUrl.username = 'app_user'
  appUrl.password = 'app_user'
  process.env['APP_DATABASE_URL'] = appUrl.toString()
}

export async function teardown() {
  await container?.stop()
}
