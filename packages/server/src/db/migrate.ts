import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { logger } from '../logger.js'

const url = process.env.DATABASE_URL
if (!url) {
  logger.error('DATABASE_URL not set')
  process.exit(1)
}
const sql = postgres(url, { max: 1 })
await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
await sql.end()
logger.info('migrations applied')
