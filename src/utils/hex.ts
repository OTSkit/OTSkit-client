/** Neutral hex <-> bytes, so the stamp path needs neither Buffer nor node:crypto. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) throw new Error('Invalid hex string')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}
