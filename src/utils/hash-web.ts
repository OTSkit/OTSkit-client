/** SHA-256 via the platform Web Crypto — identical in Node 20+ and browsers. */
export async function hashBytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource))
}

/** Hash a user-selected File/Blob without a Node stream. */
export async function hashBlob(blob: Blob): Promise<Uint8Array> {
  return hashBytes(new Uint8Array(await blob.arrayBuffer()))
}
