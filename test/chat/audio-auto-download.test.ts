import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = Bun.which('google-chrome') ?? (existsSync(macChrome) ? macChrome : null)
test.skipIf(!chrome)('conversation audio downloads on visibility, never autoplays and supports retry', async () => {
  if (!chrome) throw new Error('Chrome required')
  const dir = await mkdtemp(join(tmpdir(), 'audio-auto-download-'))
  try {
    const build = await Bun.build({ entrypoints: ['./test/chat/audio-auto-download-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.js' })
    expect(build.success).toBe(true)
    const script = await readFile(join(dir, 'fixture.js'), 'utf8')
    const html = join(dir, 'fixture.html')
    await writeFile(html, `<html><body><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=20000', '--dump-dom', `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
    const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
    expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
    const match = output.match(/<body\b[^>]*>(.*?)<\/body>/s)
    if (!match?.[1]?.startsWith('[')) throw new Error(`Missing browser results: ${output.slice(-6000)}\n${errors}`)
    const results = JSON.parse(match[1]) as { name: string; ok: boolean; error?: string }[]
    expect(results.filter(result => !result.ok)).toEqual([])
    expect(results).toHaveLength(3)
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 60000)
