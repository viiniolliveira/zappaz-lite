import { expect, test } from 'bun:test'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import * as Bun from 'bun'

async function runFixture(name: string, extraEnv: Record<string, string> = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL(`./${name}`, import.meta.url))
  const process = Bun.spawn(
    [
      execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fixture,
    ],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
        NODE_ENV: 'test',
        ...extraEnv,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  expect({
    exitCode,
    stdout: exitCode ? stdout : '',
    stderr: exitCode ? stderr : '',
  }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
}

test('MCP JSON-RPC route isolates sessions, validates authentication and inputs, and invokes tools', async () => {
  await runFixture('mcp-fixture.ts')
})

test('MCP route applies configured host and origin allowlists', async () => {
  await runFixture('mcp-allowlist-fixture.ts', {
    NODE_ENV: 'production',
    CLIENT_SECRET: 'a7E2k9Lm4Nq8Rs5Tv3Wx6Yz1Bc0Df2Gh',
    APP_URL: 'https://custom.example:8080',
  })
})
