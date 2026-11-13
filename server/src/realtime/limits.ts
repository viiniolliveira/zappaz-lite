const WINDOW_MS = 10_000
const MAX_OPERATIONS = 30
const MAX_IN_FLIGHT = 4
const MAX_CONNECTIONS = 5
const IDLE_TTL_MS = 60_000
const MAX_IDENTITIES = 10_000

export class RealtimeBudget {
  private windowStarted = Date.now()
  private attempts = 0
  private inFlight = 0
  private connections = 0
  private lastUsed = Date.now()

  begin(countInFlight = true) {
    const now = Date.now()
    this.lastUsed = now
    if (now - this.windowStarted >= WINDOW_MS) {
      this.windowStarted = now
      this.attempts = 0
    }
    if (++this.attempts > MAX_OPERATIONS) return
    if (countInFlight) return this.acquireWork()
    return () => {
      this.lastUsed = Date.now()
    }
  }

  acquireWork() {
    this.lastUsed = Date.now()
    if (this.inFlight >= MAX_IN_FLIGHT) return
    this.inFlight++
    let released = false
    return () => {
      if (released) return
      released = true
      this.inFlight--
      this.lastUsed = Date.now()
    }
  }

  connect() {
    this.lastUsed = Date.now()
    if (this.connections >= MAX_CONNECTIONS) return
    this.connections++
    let released = false
    return () => {
      if (released) return
      released = true
      this.connections--
      this.lastUsed = Date.now()
    }
  }

  expired(now: number) {
    return this.connections === 0 && this.inFlight === 0 && now - this.lastUsed >= IDLE_TTL_MS
  }
}

export function createRealtimeBudgets() {
  const identities = new Map<string, RealtimeBudget>()
  let nextCleanup = 0
  return (identity: string) => {
    const now = Date.now()
    if (now >= nextCleanup) {
      // The map has a hard cap, so cleanup work is bounded even under random identities.
      for (const [key, budget] of identities) {
        if (budget.expired(now)) identities.delete(key)
      }
      nextCleanup = now + IDLE_TTL_MS
    }
    const existing = identities.get(identity)
    if (existing) return existing
    if (identities.size >= MAX_IDENTITIES) return
    const budget = new RealtimeBudget()
    identities.set(identity, budget)
    return budget
  }
}
