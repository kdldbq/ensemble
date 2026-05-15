/**
 * Tests the migrate.ts CLI entry-point end-to-end against a fresh container.
 * Requires `pnpm build` to have run first — CI does this in topological order.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'

describe('migrate CLI', () => {
  it('exits 0 and creates the 4 core tables', async () => {
    const container = await new PostgreSqlContainer('postgres:16').start()
    const url = container.getConnectionUri()

    try {
      const migrateScript = path.resolve(import.meta.dirname, '../../dist/db/migrate.js')

      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [migrateScript], {
          env: { ...process.env, DATABASE_URL: url },
          // drizzle migrator resolves './drizzle' relative to cwd
          cwd: path.resolve(import.meta.dirname, '../..'),
        })
        child.once('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`migrate exited with code ${code}`))
        })
        child.once('error', reject)
      })

      const sql = postgres(url, { max: 1 })
      try {
        const rows = await sql<{ table_name: string }[]>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name
        `
        const names = rows.map((r) => r.table_name)
        expect(names).toEqual(
          expect.arrayContaining(['tenants', 'folders', 'workbooks', 'snapshots']),
        )
      } finally {
        await sql.end()
      }
    } finally {
      await container.stop()
    }
  }, 60_000)
})
