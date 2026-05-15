import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { S3Storage } from '../src/index'

let container: StartedTestContainer
let endpoint: string

beforeAll(async () => {
  container = await new GenericContainer('localstack/localstack:3')
    .withExposedPorts(4566)
    .withEnvironment({ SERVICES: 's3' })
    .start()
  endpoint = `http://${container.getHost()}:${container.getMappedPort(4566)}`
  const raw = new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    forcePathStyle: true,
  })
  await raw.send(new CreateBucketCommand({ Bucket: 'ensemble-test' }))
}, 90_000)

afterAll(async () => {
  await container?.stop()
}, 30_000)

describe('S3Storage', () => {
  it('put then get round-trips', async () => {
    const s = new S3Storage({
      bucket: 'ensemble-test',
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    })
    const body = new TextEncoder().encode('hello s3')
    await s.put('a/b.json', body, { contentType: 'application/json' })
    const back = await s.get('a/b.json')
    expect(new TextDecoder().decode(back)).toBe('hello s3')
  })
})
