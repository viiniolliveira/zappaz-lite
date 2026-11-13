import { RateLimitedError } from '../common/errors/rate-limited-error.ts'

/** Reject excess work rather than retaining an unbounded queue of payloads. */
export function createConcurrencyLimit(maximum: number) {
  let active = 0
  return function acquire() {
    if (active >= maximum) throw new RateLimitedError('Resource capacity exceeded; retry later')
    active++
    let released = false
    return () => {
      if (!released) {
        released = true
        active--
      }
    }
  }
}

export const acquireOutbound = createConcurrencyLimit(16)
export const acquireMediaProcessing = createConcurrencyLimit(4)
