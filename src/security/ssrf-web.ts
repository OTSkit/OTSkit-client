import { ValidationError } from '../errors.js'

/**
 * Browser URL guard: DNS/IP resolution is impossible and meaningless in a browser
 * (CORS is the trust boundary), so this validates only URL structure. Callers must
 * still restrict to a fixed calendar allowlist.
 */
export async function assertSafeCalendarUrlStructural(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ValidationError(`Calendar URL is not valid: "${url}"`)
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError(`Calendar URL must use https: "${url}"`)
  }
  if (parsed.username || parsed.password) {
    throw new ValidationError(`Calendar URL must not contain embedded credentials: "${url}"`)
  }
}
