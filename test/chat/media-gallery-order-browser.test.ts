import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome =
  Bun.which('google-chrome') ?? ((await Bun.file(macChrome).exists()) ? macChrome : null)
let directory = ''
let html = ''
beforeAll(async () => {
  if (!chrome) return
  directory = await mkdtemp(join(tmpdir(), 'zappaz-gallery-order-'))
  const outDir = join(directory, 'dist')
  const build = Bun.spawn(
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
  const [stdout, stderr, code] = await Promise.all([
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
    build.exited,
  ])
  if (code !== 0) throw new Error(`Vite build failed: ${stdout}\n${stderr}`)
  const cssName = (await readdir(join(outDir, 'assets'))).find((file) =>
    /^index-.*\.css$/.test(file),
  )
  if (!cssName) throw new Error('Application stylesheet missing')
  const css = await readFile(join(outDir, 'assets', cssName), 'utf8')
  const fixture = await Bun.build({
    entrypoints: ['./test/chat/media-gallery-order-browser-fixture.tsx'],
    target: 'browser',
    outdir: directory,
    naming: '[name]-[hash].[ext]',
  })
  if (!fixture.success) throw new Error(`Fixture build failed: ${fixture.logs.join('\n')}`)
  const entry = fixture.outputs.find(
    (output) => output.kind === 'entry-point' && output.path.endsWith('.js'),
  )
  if (!entry) throw new Error('Fixture JavaScript entry missing')
  const script = await readFile(entry.path, 'utf8')
  html = join(directory, 'fixture.html')
  await writeFile(
    html,
    `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>window.onerror=(message,source,line,column,error)=>{document.body.textContent="FAIL: "+message+" "+(error?.stack??"")}</script><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
  )
}, 60000)
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

test.skipIf(!chrome).each([1200, 390])(
  'gallery chronological order and selection at %spx',
  async (width) => {
    if (!chrome) throw new Error('Chrome is required')
    const profile = join(directory, `chrome-${width}`)
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
    let socket: WebSocket | undefined
    try {
      let port = ''
      for (let i = 0; i < 100 && !port; i++) {
        try {
          port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
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
      const connection = new WebSocket(page.webSocketDebuggerUrl)
      socket = connection
      await new Promise<void>((resolve, reject) => {
        connection.addEventListener('open', () => resolve(), { once: true })
        connection.addEventListener(
          'error',
          () => reject(new Error('Chrome debugging connection failed')),
          { once: true },
        )
      })
      let id = 0
      const pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: Error) => void }
      >()
      connection.addEventListener('message', (event) => {
        const response = JSON.parse(String(event.data)) as {
          id?: number
          result?: unknown
          error?: { message: string }
        }
        if (!response.id) return
        const request = pending.get(response.id)
        if (!request) return
        pending.delete(response.id)
        if (response.error) request.reject(new Error(response.error.message))
        else request.resolve(response.result)
      })
      const send = (method: string, params: Record<string, unknown> = {}) =>
        new Promise<unknown>((resolve, reject) => {
          const requestId = ++id
          pending.set(requestId, { resolve, reject })
          connection.send(JSON.stringify({ id: requestId, method, params }))
        })
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 800,
        deviceScaleFactor: 1,
        mobile: width < 768,
      })
      await send('Page.navigate', { url: `file://${html}` })
      let result = ''
      for (let i = 0; i < 250; i++) {
        const evaluation = (await send('Runtime.evaluate', {
          expression: 'document.body?.textContent',
          returnByValue: true,
        })) as { result?: { value?: string } }
        const text = evaluation.result?.value ?? ''
        if (text === 'ok' || text.startsWith('FAIL:')) {
          result = text
          break
        }
        await Bun.sleep(30)
      }
      if (!result) throw new Error('Browser fixture timed out')
      expect(result).toBe('ok')
    } finally {
      socket?.close()
      browser.kill()
      await browser.exited
    }
  },
  30000,
)
