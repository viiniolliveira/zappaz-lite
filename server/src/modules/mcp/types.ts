import type { User } from '@generated/prisma'

export type McpContext = { preset: 'session'; sessionId: string } | { preset: 'user'; user: User }
