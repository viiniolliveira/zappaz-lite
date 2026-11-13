import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('adds the persisted message link flag with a non-null false default', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const schema = await readFile(join(root, 'server/prisma/schema.prisma'), 'utf8')
  const model = schema.match(/model WaMessage\s*\{([\s\S]*?)\n\}/)?.[1]
  expect(model).toBeDefined()
  expect(model).toMatch(/^\s*hasLink\s+Boolean\s+@default\(false\)/m)
  const sql = await readFile(
    join(root, 'server/prisma/migrations/20261109222113_init/migration.sql'),
    'utf8',
  )
  const table = sql.match(/CREATE TABLE "WaMessage" \(([\s\S]*?)\n\);/)?.[1]
  expect(table).toBeDefined()
  expect(table).toMatch(/^\s*"hasLink"\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false\s*,?\s*$/im)
})
