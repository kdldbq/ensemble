import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path'
import type { StorageAdapter } from '@ensemble/server'

export interface FsStorageOpts { root: string }

export class FsStorage implements StorageAdapter {
  private readonly root: string
  constructor(opts: FsStorageOpts) {
    this.root = resolve(opts.root)
  }
  private safe(key: string): string {
    if (isAbsolute(key)) throw new Error('storage path must be relative')
    const full = resolve(this.root, normalize(key))
    if (!(full === this.root || full.startsWith(this.root + sep))) {
      throw new Error('storage path escapes root')
    }
    return full
  }
  async put(key: string, body: Uint8Array): Promise<void> {
    const full = this.safe(key)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body)
  }
  async get(key: string): Promise<Uint8Array> {
    const buf = await readFile(this.safe(key))
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  async delete(key: string): Promise<void> {
    await rm(this.safe(key), { force: true })
  }
}
