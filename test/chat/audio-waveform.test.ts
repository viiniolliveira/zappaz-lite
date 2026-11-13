import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')

test.skipIf(!chrome)('waveform decodes a local WAV, resets on replacement and handles invalid audio without requests', async () => {
  if (!chrome) throw new Error('google-chrome is required')
  const dir = await mkdtemp('/tmp/opencode/audio-waveform-')
  try {
    const build = await Bun.build({ entrypoints: ['./test/chat/audio-waveform-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.js' })
    expect(build.success).toBe(true)
    const script = await readFile(join(dir, 'fixture.js'), 'utf8')
    const html = join(dir, 'fixture.html')
    await writeFile(html, `<html><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--virtual-time-budget=250000', '--dump-dom', `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
    const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
    expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
    const match = output.match(/<body>(.*?)<\/body>/s)
    if (!match?.[1]) throw new Error(`Missing browser result: ${output}`)
    expect(JSON.parse(match[1])).toEqual({ ok: true, requests: 0 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30000)
