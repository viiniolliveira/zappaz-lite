import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = fileURLToPath(new URL('./better-auth-postgres-fixture.ts', import.meta.url))

async function run(command: string[], env: Record<string, string | undefined> = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`${command.join(' ')} exited ${code}\n${stdout}\n${stderr}`)
  return stdout.trim()
}

test('Better Auth and administrator endpoints with an isolated PostgreSQL database', async () => {
  const name = `zappaz-auth-test-${crypto.randomUUID()}`
  let started = false
  try {
    await run([
      'docker',
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '-e',
      'POSTGRES_USER=auth_test',
      '-e',
      'POSTGRES_PASSWORD=auth_test',
      '-e',
      'POSTGRES_DB=auth_test',
      '-p',
      '127.0.0.1::5432',
      'postgres:17-alpine',
    ])
    started = true
    await run([
      'docker',
      'exec',
      name,
      'sh',
      '-c',
      'i=0; until pg_isready -h 127.0.0.1 -U auth_test -d auth_test >/dev/null; do i=$((i+1)); [ "$i" -lt 60 ] || exit 1; sleep 1; done',
    ])
    const port = (await run(['docker', 'port', name, '5432/tcp'])).match(/:(\d+)$/)?.[1]
    expect(port).toBeDefined()
    const env = {
      DATABASE_URL: `postgresql://auth_test:auth_test@127.0.0.1:${port}/auth_test`,
      CLIENT_SECRET: 'test-secret-with-at-least-thirty-two-characters',
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:3001',
      DOTENV_CONFIG_PATH: '/dev/null',
    }
    await run(
      [
        process.execPath,
        '--bun',
        'prisma',
        'migrate',
        'deploy',
        '--config',
        'server/prisma.config.ts',
      ],
      env,
    )
    const adminFixture = fileURLToPath(
      new URL('./initialize-admin-postgres-fixture.ts', import.meta.url),
    )
    await run(
      [
        process.execPath,
        '--no-env-file',
        '--tsconfig-override',
        `${root}server/tsconfig.json`,
        adminFixture,
      ],
      env,
    )
    await run(
      [
        process.execPath,
        '--no-env-file',
        '--tsconfig-override',
        `${root}server/tsconfig.json`,
        fixture,
      ],
      env,
    )
    const rateLimitFixture = fileURLToPath(
      new URL('./better-auth-rate-limit-fixture.ts', import.meta.url),
    )
    await run(
      [
        process.execPath,
        '--no-env-file',
        '--tsconfig-override',
        `${root}server/tsconfig.json`,
        rateLimitFixture,
      ],
      { ...env, NODE_ENV: 'production', APP_URL: 'https://auth.example.test' },
    )
  } finally {
    if (started) await run(['docker', 'rm', '-f', name])
  }
}, 120_000)
