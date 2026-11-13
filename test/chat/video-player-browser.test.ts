import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome)('video player handles responsive speed, playback, keyboard, errors and source replacement', async () => {
  if (!chrome) throw new Error('google-chrome is required')
  const dir = await mkdtemp('/tmp/opencode/video-player-browser-')
  try {
    const build = await Bun.build({ entrypoints: ['./test/chat/video-player-browser-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.js' })
    expect(build.success).toBe(true)
    const script = await readFile(join(dir, 'fixture.js'), 'utf8')
    const html = join(dir, 'fixture.html')
    await writeFile(html, `<html><head><style>[data-slot="video-player-pro"] { width: 320px; height: 200px }</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${dir}/chrome`, `file://${html}`], { stdout: 'ignore', stderr: 'ignore' })
    try {
      let port = ''
      for (let i = 0; i < 100 && !port; i++) {
        try { port = (await readFile(join(dir, 'chrome/DevToolsActivePort'), 'utf8')).split('\n')[0] } catch { await Bun.sleep(50) }
      }
      if (!port) throw new Error('Chrome debugging port unavailable')
      let target: { webSocketDebuggerUrl: string } | undefined
      for (let i = 0; i < 100 && !target; i++) {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`)
        const pages = await response.json() as { type: string; url: string; webSocketDebuggerUrl: string }[]
        target = pages.find(page => page.type === 'page' && page.url.startsWith('file:'))
        if (!target) await Bun.sleep(50)
      }
      if (!target) throw new Error('Chrome fixture page unavailable')
      const socket = new WebSocket(target.webSocketDebuggerUrl)
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Browser fixture timed out')), 15000)
        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `new Promise(resolve => { const timer = setInterval(() => { const text = document.body.textContent; if (text === 'ok' || text.startsWith('FAIL:')) { clearInterval(timer); resolve(text) } }, 20) })`, awaitPromise: true, returnByValue: true } })))
        socket.addEventListener('message', event => {
          const response = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: string } }; error?: { message: string } }
          if (response.id !== 1) return
          clearTimeout(timeout)
          if (response.error) reject(new Error(response.error.message))
          else resolve(response.result?.result?.value ?? 'missing result')
        })
        socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Chrome debugging connection failed')) })
      })
      socket.close()
      expect(result).toBe('ok')
    } finally {
      browser.kill()
      await browser.exited
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 30000)
