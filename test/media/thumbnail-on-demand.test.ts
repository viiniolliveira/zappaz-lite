import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

for (const source of ['disabled', 'local', 's3'] as const) {
  test(
    source === 'disabled'
      ? 'direct retrieval generates missing thumbnails without persisting files'
      : `${source} persists binary media and generates missing thumbnails only on demand`,
    async () => {
      const root = fileURLToPath(new URL('../../', import.meta.url))
      const fixture = fileURLToPath(new URL('./thumbnail-on-demand-fixture.ts', import.meta.url))
      const child = Bun.spawn(
        [
          process.execPath,
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
            NODE_ENV: 'test',
            CLIENT_SECRET: 'fixture-secret',
            DATABASE_URL: 'postgresql://unused/unused',
            MEDIA_STORAGE_ENABLED: String(source !== 'disabled'),
            MEDIA_STORAGE_DRIVER: source === 's3' ? 's3' : 'fs',
            S3_BUCKET: 'fixture-bucket',
            S3_REGION: 'fixture-region',
            S3_ACCESS_KEY_ID: 'fixture-access',
            S3_SECRET_ACCESS_KEY: 'fixture-secret',
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
    },
  )
}
