import { expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')

test.skipIf(!chrome)(
  'tooltip arrow matches its surface in both themes and all placements',
  async () => {
    if (!chrome) throw new Error('Chrome is unavailable')
    const dir = await mkdtemp('/tmp/opencode/tooltip-browser-')
    try {
      const build = await Bun.build({
        entrypoints: ['./test/frontend/tooltip-browser-fixture.tsx'],
        target: 'browser',
        outdir: dir,
        naming: 'fixture.js',
      })
      expect(build.success).toBe(true)
      const script = await readFile(join(dir, 'fixture.js'), 'utf8')
      const vite = Bun.spawn(
        [process.execPath, 'run', 'vite', 'build', '--outDir', join(dir, 'dist')],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const [out, err, code] = await Promise.all([
        new Response(vite.stdout).text(),
        new Response(vite.stderr).text(),
        vite.exited,
      ])
      if (code) throw new Error(`Vite build failed: ${out} ${err}`)
      const css = (await readdir(join(dir, 'dist/assets'))).find((file) =>
        /^index-.*\.css$/.test(file),
      )
      if (!css) throw new Error('Vite did not emit the application stylesheet')
      const html = join(dir, 'dist/fixture.html')
      await writeFile(
        html,
        `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="assets/${css}"><style>#root { position: fixed; left: 50%; top: 50% }</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
      )
      for (const theme of ['light', 'dark'])
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const browser = Bun.spawn(
            [
              chrome,
              '--headless',
              '--no-sandbox',
              '--disable-gpu',
              '--disable-background-networking',
              '--no-proxy-server',
              '--window-size=800,600',
              '--virtual-time-budget=5000',
              '--dump-dom',
              `file://${html}?theme=${theme}&side=${side}`,
            ],
            { stdout: 'pipe', stderr: 'pipe' },
          )
          const [output, errors, exit] = await Promise.all([
            new Response(browser.stdout).text(),
            new Response(browser.stderr).text(),
            browser.exited,
          ])
          if (exit) throw new Error(`Chrome failed: ${errors}`)
          const result = output.match(/<body[^>]*data-result="([^"]+)"/)?.[1]
          if (!result) throw new Error(`Missing result for ${theme}/${side}: ${output} ${errors}`)
          const data = JSON.parse(result.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as {
            side: string
            fill: string
            background: string
            arrowBackground: string
            transform: string
            viewBox: string
            width: string
            height: string
            rectWidth: number
            rectHeight: number
            label: string
            role: string
            portaled: boolean
          }
          expect(data.side).toBe(side)
          expect(data.fill).toBe(data.background)
          expect(data.arrowBackground).toBe('rgba(0, 0, 0, 0)')
          expect(data.transform).toBe('none')
          expect(data.viewBox).toBe('0 0 30 10')
          expect(data.width).toBe('10')
          expect(data.height).toBe('5')
          expect(data.rectWidth).toBeGreaterThan(0)
          expect(data.rectHeight).toBeGreaterThan(0)
          expect(data.label).toBe('Descrição acessível')
          expect(data.role).toBe('tooltip')
          expect(data.portaled).toBe(true)
        }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  60000,
)
