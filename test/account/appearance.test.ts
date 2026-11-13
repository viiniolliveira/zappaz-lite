import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolveAppearanceTheme, themeCatalogSchema } from '../../src/lib/appearance.ts'

const catalog = themeCatalogSchema.parse(await Bun.file('public/themes/themes.json').json())

test('theme catalog validates local paths, unique IDs and default theme', () => {
  expect(catalog).toHaveLength(48)
  expect(themeCatalogSchema.safeParse([...catalog, catalog[0]]).success).toBe(false)
  expect(themeCatalogSchema.safeParse(catalog.filter(item => item.id !== 'default')).success).toBe(false)
  for (const file of ['https://example.com/theme.css', '/themes/../secret.css', '/themes/a.css?x=1']) {
    expect(themeCatalogSchema.safeParse([{ ...catalog[0], file }]).success).toBe(false)
  }
  expect(resolveAppearanceTheme(catalog, 'caffeine')?.id).toBe('caffeine')
  expect(resolveAppearanceTheme(catalog, 'removed')?.id).toBe('default')
  expect(resolveAppearanceTheme(catalog, null)?.id).toBe('default')
})

test('previews require exactly four valid colors for each mode', () => {
  const theme = catalog[0]
  for (const preview of [undefined, { light: theme.preview.light }, { light: [], dark: theme.preview.dark }, { light: [...theme.preview.light, '#ffffff'], dark: theme.preview.dark }, { light: ['url(https://example.com)', ...theme.preview.light.slice(1)], dark: theme.preview.dark }]) {
    expect(themeCatalogSchema.safeParse([{ ...theme, preview }]).success).toBe(false)
  }
})

test('all preview colors match primary, secondary, accent and muted tokens from their CSS', async () => {
  for (const theme of catalog) {
    const css = await Bun.file(`public${theme.file}`).text()
    const blocks = [...css.matchAll(/[^{}]+\{([^{}]+)\}/g)]
    const parse = (body: string) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
    const light = parse(blocks[0][1])
    const dark = { ...light, ...parse(blocks[1][1]) }
    const keys = ['primary', 'secondary', 'accent', 'muted']
    expect(theme.preview.light).toEqual(keys.map(key => light[key]))
    expect(theme.preview.dark).toEqual(keys.map(key => dark[key]))
  }
})

test('all theme files contain only matching runtime token sets in light and dark', async () => {
  let expectedLight: string[] | undefined
  for (const theme of catalog) {
    const css = await readFile(`public${theme.file}`, 'utf8')
    expect(css).not.toMatch(/@(?:import|custom-variant|theme|layer|apply)/)
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    expect(blocks.map(block => block[1].trim())).toEqual([':root', ':root.dark'])
    const [light, dark] = blocks.map(block => [...block[2].matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]).sort())
    expectedLight ??= light
    expect(light).toEqual(expectedLight)
    expect([...new Set([...light, ...dark])].sort()).toEqual(expectedLight)
    expect(light).toContain('--primary')
    expect(dark).toContain('--background')
  }
})
