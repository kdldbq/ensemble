import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function globalSetup(): Promise<void> {
  const cwd = join(__dirname, '..')
  execSync('docker compose -f docker-compose.dev.yml up -d --wait', { cwd, stdio: 'inherit' })
  execSync(
    'DATABASE_URL=postgres://postgres:postgres@localhost:5303/ensemble_dev pnpm --filter @ensemble-sheets/server exec node dist/db/migrate.js',
    { stdio: 'inherit' },
  )
}
