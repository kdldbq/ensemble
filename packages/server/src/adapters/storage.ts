export interface StorageAdapter {
  put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
  signedPutUrl?(key: string, ttlSec?: number): Promise<string>
  signedGetUrl?(key: string, ttlSec?: number, filename?: string): Promise<string>
}
