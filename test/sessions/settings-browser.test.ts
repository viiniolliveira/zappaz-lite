import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const chrome = Bun.which('google-chrome')
for (const [viewport, size] of [
  ['desktop', '1280,900'],
  ['mobile', '390,844'],
] as const) {
  test.skipIf(!chrome)(
    `session settings validation and saving (${viewport})`,
    async () => {
      if (!chrome) throw new Error('google-chrome is required')
      const dir = await mkdtemp('/tmp/opencode/session-settings-')
      try {
        const build = await Bun.build({
          entrypoints: ['./test/sessions/settings-browser-fixture.tsx'],
          target: 'browser',
          outdir: dir,
          naming: 'fixture.js',
          plugins: [
            {
              name: 'mock-session-mutation',
              setup(builder) {
                builder.onResolve({ filter: /^@\/atoms\/session$/ }, () => ({
                  path: resolve('test/sessions/settings-mutation-fixture.ts'),
                }))
              },
            },
          ],
        })
        expect(build.success).toBe(true)
        const vite = Bun.spawn(
          [process.execPath, 'run', 'vite', 'build', '--outDir', join(dir, 'dist')],
          { stdout: 'pipe', stderr: 'pipe' },
        )
        const [stdout, stderr, code] = await Promise.all([
          new Response(vite.stdout).text(),
          new Response(vite.stderr).text(),
          vite.exited,
        ])
        if (code) throw new Error(`Vite build failed: ${stdout}\n${stderr}`)
        const css = (await readdir(join(dir, 'dist/assets'))).find((file) =>
          /^index-.*\.css$/.test(file),
        )
        if (!css) throw Error('Missing production stylesheet')
        const script = await readFile(join(dir, 'fixture.js'), 'utf8')
        const html = join(dir, 'dist/fixture.html')
        await writeFile(
          html,
          `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="assets/${css}"></head><body><main id="root" class="mx-auto max-w-5xl p-4"></main><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
        )
        const browser = Bun.spawn(
          [
            chrome,
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-background-networking',
            '--no-proxy-server',
            `--window-size=${size}`,
            '--virtual-time-budget=5000',
            '--dump-dom',
            `file://${html}`,
          ],
          { stdout: 'pipe', stderr: 'pipe' },
        )
        const [output, errors, exitCode] = await Promise.all([
          new Response(browser.stdout).text(),
          new Response(browser.stderr).text(),
          browser.exited,
        ])
        expect({ exitCode, errors: exitCode ? errors : '' }).toEqual({ exitCode: 0, errors: '' })
        const result = output.match(/<body[^>]*data-results="([^"]+)"/)?.[1]
        if (!result) throw Error(`Missing browser results: ${output}`)
        const results = JSON.parse(result.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as {
          name: string
          ok: boolean
          error?: string
        }[]
        expect(results).toHaveLength(5)
        expect(results.filter((item) => !item.ok)).toEqual([])
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
    60000,
  )
}
