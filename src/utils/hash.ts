import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export function hashBuffer(data: Buffer | Uint8Array): Buffer {
  return createHash('sha256').update(data).digest()
}

export function hashFile(path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest()))
      .on('error', reject)
  })
}
