import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const docker = Bun.which('docker')

async function compose(kind: 'dev' | 'prod', env: string) {
  if (!docker) throw new Error('Docker executable is required')
  const dir = await mkdtemp('/tmp/opencode/compose-test-')
  try {
    const envFile = join(dir, '.env')
    await writeFile(envFile, env)
    const child = Bun.spawn(
      [
        docker,
        'compose',
        '--env-file',
        envFile,
        '-p',
        'zappaz-contract-test',
        '-f',
        `${root}docker/docker-compose.${kind}.yml`,
        'config',
        '--format',
        'json',
      ],
      {
        cwd: dir,
        env: {
          PATH: Bun.env.PATH,
          HOME: dir,
          DOCKER_CONFIG: Bun.env.DOCKER_CONFIG ?? join(homedir(), '.docker'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { stdout, stderr, code }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const prodEnv =
  'APP_URL=https://app.example\nCLIENT_SECRET=fixture-secret\nPOSTGRES_PASSWORD=abcdef123456\n'

test('Docker build excludes local secrets, dependencies and generated artifacts', async () => {
  const ignored = (await readFile(join(root, '.dockerignore'), 'utf8')).split(/\r?\n/)
  for (const entry of ['node_modules', '.bun', '.env*', '**/.env*', 'server/generated']) {
    expect(ignored).toContain(entry)
  }
  const dockerfile = await readFile(join(root, 'docker/Dockerfile'), 'utf8')
  const runtime = dockerfile.split('FROM oven/bun:1.4.4').at(-1)
  if (!runtime) throw new Error('Docker runtime stage missing')
  expect(runtime).toMatch(/^USER bun$/m)
  expect(runtime).not.toMatch(/^COPY\s+(?:--\S+\s+)*\.\s/m)
})

test.skipIf(!docker)('development compose contains only local database and gateway', async () => {
  const result = await compose('dev', 'MASTERPASS=fixture-password\n')
  expect({ code: result.code, stderr: result.code ? result.stderr : '' }).toEqual({
    code: 0,
    stderr: '',
  })
  const config = JSON.parse(result.stdout)
  expect(Object.keys(config.services).sort()).toEqual(['drizzle-gateway', 'postgres'])
  expect(config.services['drizzle-gateway'].environment.MASTERPASS).toBe('fixture-password')
  for (const service of Object.values(config.services) as Array<{
    ports: Array<{ host_ip: string }>
  }>) {
    for (const port of service.ports) expect(port.host_ip).toBe('127.0.0.1')
  }
  expect((await compose('dev', '')).code).not.toBe(0)
})

test.skipIf(!docker)(
  'production compose isolates the database and runs migrations without seed',
  async () => {
    const result = await compose('prod', prodEnv)
    expect({ code: result.code, stderr: result.code ? result.stderr : '' }).toEqual({
      code: 0,
      stderr: '',
    })
    const config = JSON.parse(result.stdout)
    expect(Object.keys(config.services).sort()).toEqual(['app', 'postgres'])
    const { app, postgres } = config.services
    expect(app.ports).toBeUndefined()
    expect(postgres.ports).toBeUndefined()
    expect(Object.keys(app.networks).sort()).toEqual(['backend', 'dokploy-network'])
    expect(Object.keys(postgres.networks)).toEqual(['backend'])
    expect(config.networks.backend.internal).toBe(true)
    expect(config.networks['dokploy-network'].external).toBe(true)
    expect(app.environment.DATABASE_URL).toBe(
      'postgresql://postgres:abcdef123456@postgres:5432/postgres',
    )
    expect(app.environment.APP_URL).toBe('https://app.example')
    expect(app.depends_on.postgres.condition).toBe('service_healthy')
    expect(app.command).toBeNull()
    const dockerfile = await readFile(join(root, 'docker/Dockerfile'), 'utf8')
    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "bun run db:migrate:deploy && exec bun run start"]',
    )
    expect(dockerfile).not.toMatch(/db:seed|db:create-admin/)
    for (const service of [app, postgres]) {
      expect(service.healthcheck).toBeDefined()
      expect(service.volumes.length).toBeGreaterThan(0)
      expect(service.logging.options['max-size']).toBeDefined()
      expect(service.logging.options['max-file']).toBeDefined()
    }
  },
)

test.skipIf(!docker)('production compose rejects each missing mandatory value', async () => {
  for (const missing of ['APP_URL', 'CLIENT_SECRET', 'POSTGRES_PASSWORD']) {
    const env = prodEnv
      .split('\n')
      .filter((line) => !line.startsWith(`${missing}=`))
      .join('\n')
    const result = await compose('prod', env)
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain(missing)
  }
})

test.skipIf(!docker)(
  'production compose forwards optional bootstrap and explicit reset settings',
  async () => {
    const result = await compose(
      'prod',
      `${prodEnv}ADMIN_EMAIL=admin@example.test\nADMIN_PASSWORD=fixture-password\nADMIN_RESET_PASSWORD=true\n`,
    )
    expect({ code: result.code, stderr: result.code ? result.stderr : '' }).toEqual({
      code: 0,
      stderr: '',
    })
    const { environment } = JSON.parse(result.stdout).services.app
    expect(environment.ADMIN_EMAIL).toBe('admin@example.test')
    expect(environment.ADMIN_PASSWORD).toBe('fixture-password')
    expect(environment.ADMIN_RESET_PASSWORD).toBe('true')
  },
)
