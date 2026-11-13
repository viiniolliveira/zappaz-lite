import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
let directory = ''
let html = ''
beforeAll(async () => {
  if (!chrome) return
  directory = await mkdtemp('/tmp/opencode/contact-library-')
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
  if (code !== 0) throw Error(`Vite build failed: ${stdout}\n${stderr}`)
  const cssName = (await readdir(join(outDir, 'assets'))).find((file) =>
    /^index-.*\.css$/.test(file),
  )
  if (!cssName) throw Error('Stylesheet missing')
  const css = await readFile(join(outDir, 'assets', cssName), 'utf8')
  const fixture = await Bun.build({
    entrypoints: ['./test/chat/contact-library-browser-fixture.tsx'],
    target: 'browser',
    outdir: directory,
    naming: '[name].[ext]',
  })
  if (!fixture.success) throw Error(`Fixture build failed: ${fixture.logs.join('\n')}`)
  const script = await readFile(join(directory, 'contact-library-browser-fixture.js'), 'utf8')
  html = join(directory, 'fixture.html')
  await writeFile(
    html,
    `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
  )
}, 60000)
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})
test.skipIf(!chrome).each([1440, 390])(
  'contact library behavior with actual %spx viewport',
  async (width) => {
    if (!chrome) throw Error('Chrome missing')
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
      async function send(method: string, params: Record<string, unknown> = {}) {
        const id = ++nextId
        return new Promise<unknown>((resolve, reject) => {
          pending.set(id, { resolve, reject })
          socket.send(JSON.stringify({ id, method, params }))
        })
      }
      async function evaluate(expression: string) {
        const response = (await send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        })) as { result: { value?: unknown }; exceptionDetails?: { text: string } }
        if (response.exceptionDetails) throw Error(response.exceptionDetails.text)
        return response.result.value
      }
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: width === 390 ? 844 : 800,
        deviceScaleFactor: 1,
        mobile: width === 390,
      })
      await send('Page.enable')
      await send('Page.bringToFront')
      for (const view of [
        'test',
        'summary',
        'sidebar',
        'modal-media',
        'documents',
        'links',
        'audio-gallery',
        'infinite-scenarios',
      ]) {
        await send('Page.navigate', {
          url: `file://${html}${view === 'test' ? '' : `?screenshot=${view}`}`,
        })
        const output = (await evaluate(
          `new Promise((resolve, reject) => { let n = 0; const timer = setInterval(() => { if (${view === 'test' ? "document.body?.textContent?.startsWith('[')" : "document.documentElement.dataset.ready === 'true'"}) { clearInterval(timer); resolve(${view === 'test' ? 'document.body.textContent' : 'document.documentElement.dataset.results'}); } else if (++n > 1000) { clearInterval(timer); reject(Error('fixture timeout')); } }, 20); })`,
        )) as string
        const results = JSON.parse(output) as { name: string; ok: boolean; error?: string }[]
        expect(results).toHaveLength(view === 'infinite-scenarios' ? 11 : 7)
        expect(results.filter((result) => !result.ok)).toEqual([])
        if (view === 'infinite-scenarios') continue
        await evaluate(
          `(async () => { await document.fonts.ready; for (const animation of document.getAnimations({ subtree: true })) { try { animation.finish() } catch { animation.cancel() } } })()`,
        )
        const geometry = (await evaluate(
          `(() => {
            const modal = document.querySelector('[role="dialog"]');
            const r = modal?.getBoundingClientRect();
             const panel = modal?.querySelector('[role="tabpanel"]');
             const grid = viewName === 'modal-media' ? panel?.querySelector('section > div.grid') : null;
             const tiles = grid ? Array.from(grid.children) : [];
             const first = tiles[0]?.getBoundingClientRect();
             const lastInRow = tiles.findLast((tile) => Math.abs(tile.getBoundingClientRect().top - first.top) < 1)?.getBoundingClientRect();
             const panelRect = panel?.getBoundingClientRect();
            const close = modal?.querySelector('button[data-slot="dialog-close"]');
            const button = close?.getBoundingClientRect();
            return { innerWidth, innerHeight, visualWidth: visualViewport.width, documentWidth: document.documentElement.scrollWidth,
              modal: r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, radius: getComputedStyle(modal).borderRadius,
                 overflowY: panel ? getComputedStyle(panel).overflowY : null,
                 border: getComputedStyle(modal).borderLeftWidth,
                 paddingLeft: panel ? getComputedStyle(panel).paddingLeft : null,
                 paddingBottom: panel ? getComputedStyle(panel).paddingBottom : null,
                 scrollWidth: panel?.scrollWidth, clientWidth: panel?.clientWidth,
                 firstOffset: first && panelRect ? first.left - panelRect.left : null,
                 lastOffset: lastInRow && panelRect ? lastInRow.right - (panelRect.left + panel.clientWidth) : null,
                closeText: close?.textContent?.trim(), closeVisible: !!button && button.width > 0 && button.height > 0 && button.left >= 0 && button.right <= innerWidth && button.top >= 0 && button.bottom <= innerHeight } : null };
           })()`.replace('viewName', JSON.stringify(view)),
        )) as {
          innerWidth: number
          innerHeight: number
          visualWidth: number
          documentWidth: number
          modal: {
            left: number
            right: number
            top: number
            bottom: number
            width: number
            height: number
            radius: string
            overflowY: string | null
            border: string
            paddingLeft: string | null
            paddingBottom: string | null
            scrollWidth: number
            clientWidth: number
            firstOffset: number | null
            lastOffset: number | null
            closeText: string
            closeVisible: boolean
          } | null
        }
        expect(geometry.innerWidth).toBe(width)
        expect(geometry.visualWidth).toBe(width)
        if (view !== 'test') {
          expect(geometry.documentWidth).toBeLessThanOrEqual(width)
          if (['modal-media', 'documents', 'links'].includes(view))
            expect(geometry.modal).not.toBeNull()
          if (geometry.modal && view !== 'audio-gallery') {
            expect(geometry.modal.left).toBeGreaterThanOrEqual(0)
            expect(geometry.modal.right).toBeLessThanOrEqual(width)
            expect(geometry.modal.closeText).toBe('Fechar')
            expect(geometry.modal.closeVisible).toBe(true)
            expect(geometry.modal.overflowY).toBe('auto')
            expect(geometry.modal.border).toBe('0px')
            expect(geometry.modal.scrollWidth).toBeLessThanOrEqual(geometry.modal.clientWidth)
            if (view === 'modal-media') {
              expect(geometry.modal.paddingLeft).toBe('0px')
              expect(geometry.modal.paddingBottom).toBe('0px')
              expect(geometry.modal.firstOffset).not.toBeNull()
              expect(Math.abs(geometry.modal.firstOffset ?? Infinity)).toBeLessThanOrEqual(1)
              expect(geometry.modal.lastOffset).not.toBeNull()
              expect(Math.abs(geometry.modal.lastOffset ?? Infinity)).toBeLessThanOrEqual(1)
            } else if (view === 'documents' || view === 'links') {
              expect(Number.parseFloat(geometry.modal.paddingLeft ?? '0')).toBeGreaterThan(0)
            }
            if (width === 390) {
              expect(Math.abs(geometry.modal.left)).toBeLessThanOrEqual(1)
              expect(Math.abs(geometry.modal.top)).toBeLessThanOrEqual(1)
              expect(Math.abs(geometry.modal.width - 390)).toBeLessThanOrEqual(1)
              expect(Math.abs(geometry.modal.height - 844)).toBeLessThanOrEqual(1)
              expect(geometry.modal.radius).toBe('0px')
            } else {
              expect(geometry.modal.left).toBeGreaterThan(0)
              expect(geometry.modal.top).toBeGreaterThan(0)
              expect(geometry.modal.width).toBeLessThan(width)
              expect(geometry.modal.height).toBeLessThan(geometry.innerHeight)
            }
          }
          const screenshot = (await send('Page.captureScreenshot', { format: 'png' })) as {
            data: string
          }
          await writeFile(
            `/tmp/opencode/contact-library-${width === 1440 ? 'desktop' : 'mobile'}-${view}.png`,
            Buffer.from(screenshot.data, 'base64'),
          )
          if (view === 'modal-media')
            await writeFile(
              `/tmp/opencode/library-infinite-${width === 1440 ? 'desktop' : 'mobile'}.png`,
              Buffer.from(screenshot.data, 'base64'),
            )
          if (view === 'modal-media') {
            const pagination = (await evaluate(`(async () => {
              const panel = document.querySelector('[role="dialog"] [role="tabpanel"]');
              const requests = window.libraryTestRequests;
              const nextPages = () => requests.filter(r => r.url.endsWith('/library') && r.params.kind === 'media' && !r.params.conversationId && r.params.cursor === 'next-page').length;
              panel.scrollTop = 0;
              const before = nextPages();
              await new Promise(resolve => setTimeout(resolve, 300));
              const away = nextPages();
              panel.scrollTop = panel.scrollHeight;
              for (let i = 0; i < 100 && nextPages() === away; i++) await new Promise(resolve => setTimeout(resolve, 20));
              await new Promise(resolve => setTimeout(resolve, 300));
              return { before, away, after: nextPages() };
            })()`)) as { before: number; away: number; after: number }
            expect(pagination.away).toBe(pagination.before)
            expect(pagination.after - pagination.away).toBe(1)
          }
          if (view === 'links')
            await writeFile(
              `/tmp/opencode/library-links-preview-${width === 1440 ? 'desktop' : 'mobile'}.png`,
              Buffer.from(screenshot.data, 'base64'),
            )
          if (view === 'links')
            await writeFile(
              `/tmp/opencode/library-links-title-${width === 1440 ? 'desktop' : 'mobile'}.png`,
              Buffer.from(screenshot.data, 'base64'),
            )
          if (
            (width === 390 && view === 'sidebar') ||
            (width === 1440 && ['modal-media', 'documents', 'links'].includes(view))
          ) {
            await evaluate(
              `(async () => { document.documentElement.classList.add('dark'); await document.fonts.ready; for (const animation of document.getAnimations({ subtree: true })) { try { animation.finish() } catch { animation.cancel() } } })()`,
            )
            const dark = (await send('Page.captureScreenshot', { format: 'png' })) as {
              data: string
            }
            await writeFile(
              `/tmp/opencode/contact-library-${width === 1440 ? 'desktop' : 'mobile'}-${view}-dark.png`,
              Buffer.from(dark.data, 'base64'),
            )
          }
          console.log(`${width}px ${view}: ${JSON.stringify(geometry)}`)
        }
      }
      socket.close()
    } finally {
      browser.kill()
      await browser.exited
    }
  },
  90000,
)
