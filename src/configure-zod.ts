import { z } from 'zod'

// Run before schema modules are imported: the SPA's CSP intentionally forbids eval/JIT.
z.config({ jitless: true })
