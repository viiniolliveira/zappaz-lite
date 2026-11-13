import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { WAMessageStubType } from 'baileys'
import { isIgnoredChatMessage } from '../../server/src/lib/whatsapp-event-normalizer.ts'

test('ignores only encryption, privacy and PSA stub types', () => {
  const ignored = new Set([
    WAMessageStubType.E2E_ENCRYPTED,
    WAMessageStubType.E2E_ENCRYPTED_NOW,
    WAMessageStubType.BIZ_COEX_PRIVACY_TRANSITION,
    WAMessageStubType.BIZ_PRIVACY_MODE_INIT_FB,
    WAMessageStubType.BIZ_COEX_PRIVACY_INIT,
    WAMessageStubType.CHAT_PSA,
    WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB,
    WAMessageStubType.BIZ_BOT_1P_MESSAGING_ENABLED,
    WAMessageStubType.BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE,
  ])
  for (const value of Object.values(WAMessageStubType)) {
    if (typeof value === 'number')
      expect(isIgnoredChatMessage({ messageStubType: value })).toBe(ignored.has(value))
  }
  for (const value of [null, undefined, -1, 224, 9999]) {
    expect(isIgnoredChatMessage({ messageStubType: value })).toBe(false)
  }
})

test('skips ignored history and live messages before persistence and retains other stubs', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const bun = Bun.which('bun')
  if (!bun) throw new Error('bun executable not found')
  const child = Bun.spawn(
    [
      bun,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fileURLToPath(new URL('./chat-ignored-fixture.ts', import.meta.url)),
    ],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
        NODE_ENV: 'test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
