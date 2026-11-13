import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { validateChatTestDatabaseUrl } from './chat-test-database.ts'

const requestedUrl = Bun.env.CHAT_TEST_DATABASE_URL

test.skipIf(!requestedUrl).each([
  ['duplicate-alias', 'learns and publishes an alias from a duplicate without creating a bubble'],
  ['modes', 'associates PN and LID in both addressing modes and normalizes devices'],
  ['contacts', 'preserves aliases across partial contact events without matching names'],
  ['group', 'does not treat group participants as private contacts or infer phones from LIDs'],
  ['lookup', 'finds, updates, reacts to and deletes messages through either alias'],
  ['deletion', 'does not resurrect a deleted conversation through its other alias'],
  ['conflict', 'rejects association of two conversations without losing data'],
  ['conflicting-phone', 'rejects a second phone associated with an existing LID atomically'],
  ['mixed-conflicts', 'continues after multiple conflicts while preserving identities and history'],
  ['late-association', 'keeps deleted history suppressed after association and live recreation'],
  ['create-after-association', 'reuses the conversation when creating after association'],
  ['create-by-phone', 'opens and reuses a conversation without saving an agenda contact'],
  ['consolidate', 'consolidates contacts while preserving the conversation contact'],
])('%s: %s', async (scenario) => {
  if (!requestedUrl) throw new Error('CHAT_TEST_DATABASE_URL is required')
  const url = validateChatTestDatabaseUrl(requestedUrl)
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn([
    Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`,
    fileURLToPath(new URL('./chat-identity-fixture.ts', import.meta.url)), scenario,
  ], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', DATABASE_URL: url, CHAT_TEST_DATABASE_URL: url, CLIENT_SECRET: 'test', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
