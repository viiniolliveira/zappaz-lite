import type { Prisma } from '@generated/prisma'
import type { z } from 'zod'
import type { LibraryQuerySchema } from './schema.ts'

export type LibraryQuery = z.infer<typeof LibraryQuerySchema>
export type LibraryMessageWhere = Prisma.WaMessageWhereInput
