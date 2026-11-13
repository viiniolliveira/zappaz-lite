import type { Context } from 'hono'
import type { AppEnv } from '../../create-app.ts'
import { LibraryParamsSchema, LibraryQuerySchema } from './schema.ts'
import { listLibrary } from './service.ts'

export async function listLibraryController(c: Context<AppEnv>) {
  const { sessionId } = LibraryParamsSchema.parse(c.req.param())
  return c.json(await listLibrary(sessionId, LibraryQuerySchema.parse(c.req.query())))
}
