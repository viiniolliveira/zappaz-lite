import { expect, test } from 'bun:test'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

async function runFixture(name: string) {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL(`./transport-limits-${name}.ts`, import.meta.url))
  const child = Bun.spawn(
    [execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
        NODE_ENV: 'test',
        MEDIA_MAX_FILE_SIZE_MB: '1',
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
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  })
}

test('request body limits are lazy, byte-accurate and release bounded capacity', async () => {
  await runFixture('http')
})

test('MCP rejects batches before dispatch and handles individual requests', async () => {
  await runFixture('mcp')
})

test('access logging excludes query strings, headers and bodies', async () => {
  await runFixture('access-log')
})

test('a stalled body read times out and releases reader capacity', async () => {
  await runFixture('timeout')
})
