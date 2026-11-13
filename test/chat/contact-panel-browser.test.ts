import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
let directory = ''
let html = ''
beforeAll(async () => {
  if (!chrome) return
  directory = await mkdtemp('/tmp/opencode/contact-panel-')
  const outDir = join(directory, 'dist')
  const build = Bun.spawn([process.execPath, './node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (code !== 0) throw new Error(`Vite build failed: ${stdout}\n${stderr}`)
  const cssName = (await readdir(join(outDir, 'assets'))).find(file => /^index-.*\.css$/.test(file))
  if (!cssName) throw new Error('Application stylesheet missing')
  const css = await readFile(join(outDir, 'assets', cssName), 'utf8')
  const fixture = await Bun.build({ entrypoints: ['./test/chat/contact-panel-browser-fixture.tsx'], target: 'browser', outdir: directory, naming: '[name].[ext]' })
  if (!fixture.success) throw new Error(`Fixture build failed: ${fixture.logs.join('\n')}`)
  const script = await readFile(join(directory, 'contact-panel-browser-fixture.js'), 'utf8')
  html = join(directory, 'fixture.html')
  await writeFile(html, `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
}, 60000)
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

test.skipIf(!chrome).each([1440, 390])('contact information header at %spx', async width => {
  if (!chrome) throw new Error('Chrome is required')
  const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', `--window-size=${width},800`, '--virtual-time-budget=5000', '--dump-dom', `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
  const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
  expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
  const match = output.match(/<body\b[^>]*>(.*?)<\/body>/s)
  if (!match?.[1]) throw new Error(`Missing browser results: ${output}`)
  const results = JSON.parse(match[1]) as { name: string; ok: boolean; error?: string }[]
  expect(results).toHaveLength(8)
  expect(results.filter(result => !result.ok)).toEqual([])
}, 30000)
