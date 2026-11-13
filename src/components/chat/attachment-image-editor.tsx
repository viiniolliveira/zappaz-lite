import '@image-ultra/react/styles.css'
import { type ExportResult, ImageEditor } from '@image-ultra/react'
import { useAtomValue } from 'jotai'
import { useTheme } from 'next-themes'
import { type FocusEvent, type PointerEvent, useState } from 'react'
import { mediaMaxFileSizeBytesAtom } from '@/atoms/media'
import { imageEditorLabels } from './image-editor-labels'

export default function AttachmentImageEditor({
  file,
  onApply,
  onCancel,
}: {
  file: File
  onApply: (file: File) => void
  onCancel: () => void
}) {
  const { resolvedTheme } = useTheme()
  const maxBytes = useAtomValue(mediaMaxFileSizeBytesAtom)
  const [error, setError] = useState<string | null>(null)
  function prepareToolTooltip(event: PointerEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('.iu-rail__item')
    if (!button) return
    const label = button.querySelector('.iu-rail__label')?.textContent
    // Use the editor's own tooltip layer; capture runs before its native listeners.
    if (event.currentTarget.clientWidth >= 768 && label) button.dataset.tooltip = label
    else delete button.dataset.tooltip
  }
  function apply(result: ExportResult) {
    const extension = new Map([
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
    ]).get(result.blob.type)
    if (
      !extension ||
      result.mimeType !== result.blob.type ||
      !result.blob.size ||
      !Number.isInteger(result.width) ||
      result.width <= 0 ||
      !Number.isInteger(result.height) ||
      result.height <= 0
    ) {
      setError('Não foi possível exportar a imagem. Tente novamente.')
      return
    }
    if (maxBytes === null) {
      setError('Limite de arquivos indisponível. Recarregue a página para tentar novamente.')
      return
    }
    if (result.blob.size > maxBytes) {
      setError(
        `A imagem editada excede ${maxBytes / 1024 / 1024} MiB. Reduza as dimensões antes de aplicar.`,
      )
      return
    }
    onApply(
      new File([result.blob], `${file.name.replace(/\.[^.]+$/, '')}-editada.${extension}`, {
        type: result.blob.type,
      }),
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        className="min-h-0 flex-1 overflow-auto [&_.iu-root]:min-h-0! [&_.iu-root]:min-w-0! [&_.iu-root]:[--iu-size-rail:56px]! [&_.iu-rail\_\_item]:min-h-11! [@container_iu_(min-width:768px)]:[&_.iu-rail\_\_label]:sr-only! [@container_iu_(max-width:767px)]:[&_.iu-rail\_\_item]:basis-28!"
        onPointerOverCapture={prepareToolTooltip}
        onFocusCapture={prepareToolTooltip}
      >
        <ImageEditor
          src={file}
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          className="[--iu-accent:var(--primary)]! [--iu-accent-hover:var(--primary)]! [--iu-accent-contrast:var(--primary-foreground)]! [--iu-accent-soft:color-mix(in_oklch,var(--primary),transparent_85%)]! [--iu-accent-text:var(--foreground)]! [--iu-bg:var(--background)]! [--iu-stage:var(--background)]! [--iu-surface-1:var(--card)]! [--iu-surface-2:var(--muted)]! [--iu-surface-3:var(--accent)]! [--iu-text:var(--foreground)]! [--iu-text-muted:var(--muted-foreground)]! [--iu-text-subtle:var(--muted-foreground)]! [--iu-border:var(--border)]! [--iu-border-strong:var(--border)]! [--iu-danger:var(--destructive)]!"
          labels={imageEditorLabels}
          persistLooks={false}
          exportOptions={{
            mimeType:
              file.type === 'image/png'
                ? 'image/png'
                : file.type === 'image/webp'
                  ? 'image/webp'
                  : 'image/jpeg',
            quality: 0.92,
          }}
          onSave={apply}
          onCancel={onCancel}
          onError={() =>
            setError(
              'Não foi possível processar esta imagem. Cancele a edição para enviar o arquivo original.',
            )
          }
        />
      </div>
    </div>
  )
}
