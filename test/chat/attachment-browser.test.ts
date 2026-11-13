import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compile } from '@tailwindcss/node'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome)('attachment queue and workspace', async () => {
  if (!chrome) throw new Error('google-chrome is required')
  const dir = await mkdtemp('/tmp/opencode/attachment-')
  try {
    const build = await Bun.build({ entrypoints: ['./test/chat/attachment-browser-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.[ext]' })
    expect(build.success).toBe(true)
    const script = await readFile(join(dir, 'fixture.js'), 'utf8')
    const html = join(dir, 'fixture.html')
    const source = await readFile('src/components/chat/attachment-image-editor.tsx', 'utf8')
    const candidates = source.match(/[^\s"']*sr-only![^\s"']*/g) ?? []
    const tailwind = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency: () => {} })
    const libraryCss = await readFile('node_modules/@image-ultra/react/dist/styles.css', 'utf8')
    await writeFile(html, `<html><head><style>${libraryCss}\n${tailwind.build(candidates)}</style></head><body><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--virtual-time-budget=20000', '--dump-dom', `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
    const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
    expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
    const match = output.match(/<body\b[^>]*>(.*?)<\/body>/s)
    if (!match?.[1]) throw new Error(`Browser output does not contain test results: ${output}`)
    const results = JSON.parse(match[1]) as { name: string; ok: boolean; error?: string }[]
    expect(results.filter(result => !result.ok)).toEqual([])
    expect(results).toHaveLength(11)
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 60000)
