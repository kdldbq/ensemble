import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageAdapter } from '@ensemble-sheets/server'

export interface S3StorageOpts extends S3ClientConfig {
  bucket: string
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(opts: S3StorageOpts) {
    const { bucket, ...rest } = opts
    this.bucket = bucket
    this.client = new S3Client(rest)
  }

  async put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ...(opts?.contentType !== undefined ? { ContentType: opts.contentType } : {}),
      }),
    )
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!res.Body) throw new Error(`storage-s3: empty body for key ${key}`)
    return res.Body.transformToByteArray()
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async signedGetUrl(key: string, ttlSec = 600, filename?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename}"` } : {}),
    })
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSec })
  }

  async signedPutUrl(key: string, ttlSec = 600): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSec,
    })
  }
}
