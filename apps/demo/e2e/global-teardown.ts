import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default async function globalTeardown(): Promise<void> {
  if (process.env.CI) {
    const cwd = join(__dirname, '..')
    execSync('docker compose -f docker-compose.dev.yml down', { cwd, stdio: 'inherit' })
  }
}
