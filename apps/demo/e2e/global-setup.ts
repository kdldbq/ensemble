import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function globalSetup(): Promise<void> {
  const cwd = join(__dirname, '..')
  execSync('docker compose -f docker-compose.dev.yml up -d --wait', { cwd, stdio: 'inherit' })
  execSync(
    'DATABASE_URL=postgres://postgres:postgres@localhost:54320/ensemble_dev pnpm --filter @ensemble-sheets/server exec node dist/db/migrate.js',
    { stdio: 'inherit' }
  )
}
