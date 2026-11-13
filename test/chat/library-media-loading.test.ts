import { expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome).each([
  [390, 'library-media-loading-fixture'],
  [1440, 'library-media-loading-fixture'],
  [390, 'library-full-media-fixture'],
  [1440, 'library-full-media-fixture'],
] as const)(
  'library media loading at %spx: %s',
  async (width, fixture) => {
    if (!chrome) throw Error('Chrome missing')
    const directory = await mkdtemp('/tmp/opencode/library-media-loading-')
    try {
      const build = await Bun.build({
        entrypoints: [`./test/chat/${fixture}.tsx`],
        target: 'browser',
        outdir: directory,
        naming: '[name].js',
      })
      if (!build.success) throw Error(build.logs.join('\n'))
      const outDir = join(directory, 'dist')
      const vite = Bun.spawn(
        [
          process.execPath,
          './node_modules/vite/bin/vite.js',
          'build',
          '--outDir',
          outDir,
          '--emptyOutDir',
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const [viteOutput, viteErrors, viteCode] = await Promise.all([
        new Response(vite.stdout).text(),
        new Response(vite.stderr).text(),
        vite.exited,
      ])
      if (viteCode !== 0) throw Error(`Vite failed: ${viteOutput} ${viteErrors}`)
      const cssName = (await readdir(join(outDir, 'assets'))).find((name) =>
        /^index-.*\.css$/.test(name),
      )
      if (!cssName) throw Error('CSS missing')
      const css = await readFile(join(outDir, 'assets', cssName), 'utf8')
      const script = await readFile(join(directory, `${fixture}.js`), 'utf8')
      const html = join(directory, 'fixture.html')
      await writeFile(
        html,
        `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
      )
      const profile = join(directory, 'profile')
      const browser = Bun.spawn(
        [
          chrome,
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-background-networking',
          '--no-proxy-server',
          '--remote-debugging-port=0',
          `--user-data-dir=${profile}`,
          'about:blank',
        ],
        { stdout: 'ignore', stderr: 'ignore' },
      )
      try {
        let port = ''
        for (let i = 0; i < 100 && !port; i++) {
          try {
            port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
          } catch {
            await Bun.sleep(50)
          }
        }
        if (!port) throw Error('Chrome debugging port unavailable')
        const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
          type: string
          webSocketDebuggerUrl: string
        }[]
        const target = targets.find((item) => item.type === 'page')
        if (!target) throw Error('Chrome page unavailable')
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise<void>((resolve, reject) => {
          socket.addEventListener('open', () => resolve(), { once: true })
          socket.addEventListener('error', () => reject(Error('CDP connection failed')), {
            once: true,
          })
        })
        let nextId = 0
        const pending = new Map<
          number,
          { resolve: (value: unknown) => void; reject: (error: Error) => void }
        >()
        socket.addEventListener('message', (event) => {
          const message = JSON.parse(String(event.data)) as {
            id?: number
            result?: unknown
            error?: { message: string }
          }
          if (message.id === undefined) return
          const task = pending.get(message.id)
          if (!task) return
          pending.delete(message.id)
          if (message.error) task.reject(Error(message.error.message))
          else task.resolve(message.result)
        })
        function send(method: string, params: Record<string, unknown> = {}) {
          const id = ++nextId
          return new Promise<unknown>((resolve, reject) => {
            pending.set(id, { resolve, reject })
            socket.send(JSON.stringify({ id, method, params }))
          })
        }
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 844,
          deviceScaleFactor: 1,
          mobile: width === 390,
        })
        await send('Page.enable')
        await send('Page.navigate', { url: `file://${html}` })
        const result = (await send('Runtime.evaluate', {
          expression: `new Promise((resolve, reject) => { let count = 0; const timer = setInterval(() => { const text = document.body?.textContent || ''; if (text === 'ok' || text.startsWith('FAIL:')) { clearInterval(timer); resolve(text) } else if (++count > 600) { clearInterval(timer); reject(Error('fixture timeout')) } }, 20) })`,
          awaitPromise: true,
          returnByValue: true,
        })) as { result: { value?: string }; exceptionDetails?: { text: string } }
        if (result.exceptionDetails) throw Error(result.exceptionDetails.text)
        expect(result.result.value).toBe('ok')
        socket.close()
      } finally {
        browser.kill()
        await browser.exited
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  30000,
)
