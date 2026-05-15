import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll } from 'vitest'
import { createDb, type Database } from '../../src/db/client'

let container: StartedPostgreSqlContainer
export let db: Database
export let dbUrl: string

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start()
  dbUrl = container.getConnectionUri()
  const sql = postgres(dbUrl, { max: 1 })
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  await sql.end()
  db = createDb(dbUrl)
}, 60_000)

afterAll(async () => {
  await container?.stop()
}, 30_000)
