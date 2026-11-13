import { expect, test } from 'bun:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const image = process.env.ZAPPAZ_DOCKER_TEST_IMAGE

test.skipIf(!image)(
  'production image and isolated compose enforce runtime security and persist state',
  async () => {
    if (!image) throw new Error('Docker test image is required')
    const docker = Bun.which('docker')
    if (!docker) throw new Error('Docker executable is required')
    const dir = await mkdtemp('/tmp/opencode/docker-runtime-')
    const id = randomUUID().replaceAll('-', '')
    const project = `zappaztest${id}`
    const network = `zappaztest-${id}`
    const envFile = join(dir, 'runtime.env')
    const override = join(dir, 'override.yml')
    const secret = () => randomBytes(32).toString('hex')
    const password = secret()
    const clientSecret = secret()
    const dbPassword = secret()
    const subprocessEnv = {
      PATH: process.env.PATH,
      HOME: dir,
      DOCKER_CONFIG: process.env.DOCKER_CONFIG ?? join(homedir(), '.docker'),
      ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}),
      ...(process.env.DOCKER_CONTEXT ? { DOCKER_CONTEXT: process.env.DOCKER_CONTEXT } : {}),
    }
    const envContent = `APP_URL=https://app.example.test\nCLIENT_SECRET=${clientSecret}\nPOSTGRES_PASSWORD=${dbPassword}\nADMIN_EMAIL=admin@example.test\nADMIN_PASSWORD=${password}\nMEDIA_STORAGE_ENABLED=true\n`
    async function run(args: string[]) {
      const child = Bun.spawn([docker, ...args], {
        cwd: dir,
        env: subprocessEnv,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      const sanitized = stderr
        .split('\n')
        .filter((line) => !/cookie|authorization|bearer|session_token/i.test(line))
        .join('\n')
        .replaceAll(password, '[redacted]')
        .replaceAll(clientSecret, '[redacted]')
        .replaceAll(dbPassword, '[redacted]')
      if (code !== 0)
        throw new Error(
          `Docker command failed (exit ${code}): ${args.slice(0, 2).join(' ')}\n${sanitized}`,
        )
      return { stdout: stdout.trim(), code }
    }
    const compose = (...args: string[]) =>
      run([
        'compose',
        '--env-file',
        envFile,
        '-p',
        project,
        '-f',
        join(root, 'docker/docker-compose.prod.yml'),
        '-f',
        override,
        ...args,
      ])
    let created = false
    try {
      await writeFile(envFile, envContent, { mode: 0o600 })
      await writeFile(
        override,
        `services:\n  app:\n    image: ${JSON.stringify(image)}\nnetworks:\n  dokploy-network:\n    name: ${network}\n`,
      )
      await run(['image', 'inspect', image])
      const migrationContainer = (
        await run([
          'create',
          '--network',
          'none',
          '-e',
          'DATABASE_URL=postgresql://probe:probe@127.0.0.1:1/probe?connect_timeout=2',
          image,
        ])
      ).stdout
      try {
        const child = Bun.spawn([docker, 'start', '-a', migrationContainer], {
          cwd: dir,
          env: subprocessEnv,
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 30_000,
        })
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        expect(code).toBe(1)
        expect(`${stdout}\n${stderr}`).toContain('P1001')
        expect(`${stdout}\n${stderr}`).not.toContain('Server listening')
      } finally {
        await run(['rm', '-f', migrationContainer])
      }
      await run(['network', 'create', network])
      created = true
      await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '180')
      const app = (await compose('ps', '-q', 'app')).stdout
      const db = (await compose('ps', '-q', 'postgres')).stdout
      expect(app).toBeTruthy()
      expect(db).toBeTruthy()
      for (const container of [app, db]) {
        const state = JSON.parse(
          (await run(['inspect', '--format', '{{json .State.Health.Status}}', container])).stdout,
        )
        expect(state).toBe('healthy')
        const ports = JSON.parse(
          (await run(['inspect', '--format', '{{json .HostConfig.PortBindings}}', container]))
            .stdout,
        )
        expect(Object.keys(ports ?? {})).toHaveLength(0)
        const mounts = JSON.parse(
          (await run(['inspect', '--format', '{{json .Mounts}}', container])).stdout,
        ) as Array<{ Type: string }>
        expect(mounts.every((mount) => mount.Type === 'volume')).toBe(true)
      }
      const dbNetworks = JSON.parse(
        (await run(['inspect', '--format', '{{json .NetworkSettings.Networks}}', db])).stdout,
      )
      expect(Object.keys(dbNetworks)).toEqual([`${project}_backend`])
      const appNetworks = JSON.parse(
        (await run(['inspect', '--format', '{{json .NetworkSettings.Networks}}', app])).stdout,
      )
      expect(Object.keys(appNetworks).sort()).toEqual([`${project}_backend`, network].sort())
      expect(
        (await run(['network', 'inspect', '--format', '{{.Internal}}', `${project}_backend`]))
          .stdout,
      ).toBe('true')
      await run([
        'exec',
        app,
        'sh',
        '-c',
        'test "$(id -u)" -ne 0 && test -z "$(find /app \\( -name .env -o -name ".env.*" -o -name .bun \\) -print -quit)" && command -v ffmpeg >/dev/null && test -s /app/dist/index.html && test -d /app/dist/assets && test -d /app/server/generated/prisma && test -w /app/storage/media && echo sentinel > /app/storage/media/runtime-sentinel',
      ])
      await run([
        'exec',
        app,
        'bun',
        '--bun',
        'prisma',
        'migrate',
        'status',
        '--config',
        'server/prisma.config.ts',
      ])
      const sql = `SELECT (SELECT count(*) FROM "User") || ':' || (SELECT count(*) FROM "User" WHERE role = 'ADMIN') || ':' || (SELECT count(*) FROM "Account" WHERE "providerId" = 'credential') || ':' || (SELECT md5(password) FROM "Account" WHERE "providerId" = 'credential');`
      const dbState = async () =>
        (await run(['exec', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql])).stdout
      const initial = await dbState()
      expect(initial).toMatch(/^1:1:1:[a-f0-9]{32}$/)
      const probe = await readFile(join(root, 'test/docker/runtime-probe.ts'), 'utf8')
      await run(['exec', app, 'bun', '--no-env-file', '-e', probe])
      await compose('down', '--remove-orphans')
      await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '180')
      const restarted = (await compose('ps', '-q', 'app')).stdout
      const restartedDb = (await compose('ps', '-q', 'postgres')).stdout
      expect(
        (await run(['exec', restartedDb, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]))
          .stdout,
      ).toBe(initial)
      await run([
        'exec',
        restarted,
        'sh',
        '-c',
        'test "$(cat /app/storage/media/runtime-sentinel)" = sentinel',
      ])
      await run(['exec', restarted, 'bun', '--no-env-file', '-e', probe])
    } finally {
      try {
        if (created) {
          try {
            await compose('down', '--volumes', '--remove-orphans')
          } finally {
            await run(['network', 'rm', network])
          }
        }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  },
  480_000,
)
