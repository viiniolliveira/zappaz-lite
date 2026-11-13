import { z } from 'zod'

export const appearanceStorageKey = 'zappaz-theme'
const previewColorSchema = z
  .string()
  .regex(
    /^(?:#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8}|(?:oklch|oklab|hsl|hsla|rgb|rgba)\([\d\s.,%/+-]+\))$/i,
  )
const paletteSchema = z.tuple([
  previewColorSchema,
  previewColorSchema,
  previewColorSchema,
  previewColorSchema,
])
export const themeCatalogSchema = z
  .array(
    z.strictObject({
      id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: z.string().trim().min(1),
      file: z.string().regex(/^\/themes\/[a-z0-9]+(?:-[a-z0-9]+)*\.css$/),
      preview: z.strictObject({ light: paletteSchema, dark: paletteSchema }),
    }),
  )
  .min(1)
  .superRefine((themes, ctx) => {
    if (new Set(themes.map((theme) => theme.id)).size !== themes.length)
      ctx.addIssue({ code: 'custom', message: 'O catálogo contém IDs de tema repetidos.' })
    if (!themes.some((theme) => theme.id === 'default'))
      ctx.addIssue({ code: 'custom', message: 'O catálogo precisa incluir o tema padrão.' })
  })
export type AppearanceTheme = z.infer<typeof themeCatalogSchema>[number]

export function resolveAppearanceTheme(themes: AppearanceTheme[], id: string | null) {
  return themes.find((theme) => theme.id === id) ?? themes.find((theme) => theme.id === 'default')
}
