import { expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('API modules consume validated config instead of reading the environment', async () => {
  const root = fileURLToPath(new URL('../../server/src/', import.meta.url))
  const files = await readdir(root, { recursive: true })
  for (const file of files) {
    if (!file.endsWith('.ts') || file === 'config.ts') continue
    const source = await readFile(join(root, file), 'utf8')
    expect(source, file).not.toMatch(/\bprocess\s*\.\s*env\b|\bBun\s*\.\s*env\b|\bimport\s*\.\s*meta\s*\.\s*env\b/)
  }
})
