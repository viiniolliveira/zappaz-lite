import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import createApp from '../../server/src/create-app.ts'
import { createFrontendRouter } from '../../server/src/modules/frontend/route.ts'

const chrome = Bun.which('google-chrome')
const bun = process.execPath
for (const mode of ['dev', 'production'] as const)
  test.skipIf(!chrome)(
    `renders real PDF viewer and preview through Vite ${mode}`,
    async () => {
      const dir = await mkdtemp('/tmp/opencode/pdf-browser-')
      const reserved = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() })
      const portNumber = reserved.port
      reserved.stop()
      const origin = `http://127.0.0.1:${portNumber}`
      let server: ReturnType<typeof Bun.spawn> | undefined
      let appServer: ReturnType<typeof Bun.serve> | undefined
      let browser: ReturnType<typeof Bun.spawn> | undefined
      let socket: WebSocket | undefined
      const workerRequests: { url: string; status: number; contentType: string }[] = []
      try {
        if (mode === 'production') {
          const outDir = join(dir, 'dist')
          const build = Bun.spawn(
            [
              bun,
              '--no-env-file',
              'node_modules/vite/bin/vite.js',
              'build',
              '--config',
              'test/chat/pdf-vite-fixture.ts',
              '--outDir',
              outDir,
            ],
            {
              env: { PATH: process.env.PATH, HOME: dir, PDF_FIXTURE_DIR: dir },
              stdout: 'pipe',
              stderr: 'pipe',
            },
          )
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(build.stdout).text(),
            new Response(build.stderr).text(),
            build.exited,
          ])
          if (exitCode) throw new Error(`Vite build failed: ${stdout}\n${stderr}`)
          const app = createApp()
          app.route('/', createFrontendRouter(outDir))
          appServer = Bun.serve({
            port: portNumber,
            hostname: '127.0.0.1',
            async fetch(request) {
              const response = await app.fetch(request)
              const url = new URL(request.url)
              if (url.pathname.includes('pdf.worker'))
                workerRequests.push({
                  url: url.href,
                  status: response.status,
                  contentType: response.headers.get('content-type') ?? '',
                })
              return response
            },
          })
          const htmlResponse = await fetch(`${origin}/test/chat/pdf-browser.html`)
          expect(htmlResponse.headers.get('content-security-policy')).toContain(
            "script-src 'self' 'wasm-unsafe-eval'",
          )
          for (const path of [
            '/pdfjs/standard_fonts/FoxitSerif.pfb',
            '/pdfjs/cmaps/Adobe-CNS1-1.bcmap',
            '/pdfjs/wasm/openjpeg.wasm',
          ]) {
            const response = await fetch(`${origin}${path}`)
            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).not.toContain('text/html')
            expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100)
          }
        } else {
          server = Bun.spawn(
            [
              bun,
              'run',
              'vite',
              '--host',
              '127.0.0.1',
              '--port',
              String(portNumber),
              '--strictPort',
            ],
            { stdout: 'ignore', stderr: 'ignore' },
          )
        }
        let ready = false
        for (let i = 0; i < 100; i++) {
          try {
            ready = (await fetch(`${origin}/test/chat/pdf-browser.html`)).ok
          } catch {}
          if (ready) break
          await Bun.sleep(100)
        }
        expect(ready).toBe(true)
        browser = Bun.spawn(
          [
            chrome ?? '',
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--no-proxy-server',
            '--remote-debugging-port=0',
            `--user-data-dir=${dir}`,
            'about:blank',
          ],
          { stdout: 'ignore', stderr: 'ignore' },
        )
        let port = ''
        for (let i = 0; i < 100 && !port; i++) {
          try {
            port = (await readFile(join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
          } catch {
            await Bun.sleep(50)
          }
        }
        if (!port) throw new Error('Chrome debugging port unavailable')
        const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
          type: string
          webSocketDebuggerUrl: string
        }[]
        const page = pages.find((item) => item.type === 'page')
        if (!page) throw new Error('Chrome page unavailable')
        socket = new WebSocket(page.webSocketDebuggerUrl)
        const connection = socket
        await new Promise<void>((resolve, reject) => {
          connection.addEventListener('open', () => resolve(), { once: true })
          connection.addEventListener('error', () => reject(new Error('CDP connection failed')), {
            once: true,
          })
        })
        let id = 0
        const pending = new Map<number, (value: { result?: { value?: unknown } }) => void>()
        const workers: string[] = []
        connection.addEventListener('message', (event) => {
          const data = JSON.parse(String(event.data))
          if (
            ['Target.targetCreated', 'Target.targetInfoChanged'].includes(data.method) &&
            data.params.targetInfo.type === 'worker'
          )
            workers.push(data.params.targetInfo.url)
          if (data.id) {
            pending.get(data.id)?.(data.result)
            pending.delete(data.id)
          }
        })
        const command = (method: string, params: Record<string, unknown> = {}) =>
          new Promise<{ result?: { value?: unknown } }>((resolve) => {
            const next = ++id
            pending.set(next, resolve)
            connection.send(JSON.stringify({ id: next, method, params }))
          })
        await command('Page.enable')
        await command('Target.setDiscoverTargets', { discover: true })
        if (mode === 'production')
          await command('Page.addScriptToEvaluateOnNewDocument', {
            source: `window.pdfCspViolations = []; document.addEventListener('securitypolicyviolation', event => window.pdfCspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI, source: event.sourceFile }));`,
          })
        const allViolations: unknown[] = []
        for (const query of ['', '?preview', '?workspace', '?gallery']) {
          await command('Page.navigate', { url: `${origin}/test/chat/pdf-browser.html${query}` })
          let result = ''
          for (let i = 0; i < 300; i++) {
            const evaluation = await command('Runtime.evaluate', {
              expression: `location.search === ${JSON.stringify(query)} ? document.body?.textContent : ''`,
              returnByValue: true,
            })
            const text = String(evaluation.result?.value ?? '')
            if (text === 'ok' || text.startsWith('FAIL:')) {
              result = text
              break
            }
            await Bun.sleep(100)
          }
          expect({ query, result }).toEqual({ query, result: 'ok' })
          if (mode === 'production') {
            const violations = await command('Runtime.evaluate', {
              expression: 'window.pdfCspViolations',
              returnByValue: true,
            })
            allViolations.push({ query, violations: violations.result?.value })
          }
        }
        expect(workers.length).toBeGreaterThan(0)
        if (mode === 'production') {
          expect(workerRequests.length).toBeGreaterThan(0)
          const worker = workerRequests[0]
          expect(worker.url.startsWith(`${origin}/assets/pdf.worker`)).toBe(true)
          expect(worker.status).toBe(200)
          expect(worker.contentType).not.toContain('text/html')
          const response = await fetch(worker.url)
          expect(response.status).toBe(200)
          expect(response.headers.get('content-type')).not.toContain('text/html')
          expect((await response.text()).length).toBeGreaterThan(100_000)
          expect(allViolations).toEqual(
            ['', '?preview', '?workspace', '?gallery'].map((query) => ({
              query,
              violations: [],
            })),
          )
        }
      } finally {
        socket?.close()
        browser?.kill()
        if (browser) await browser.exited
        server?.kill()
        if (server) await server.exited
        appServer?.stop(true)
        await rm(dir, { recursive: true, force: true })
      }
    },
    90000,
  )
