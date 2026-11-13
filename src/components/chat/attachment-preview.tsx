import { FileText, Loader2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useState } from 'react'

const PdfFirstPagePreview = lazy(() =>
  import('./pdf-document').then((module) => ({ default: module.PdfFirstPagePreview })),
)

function useAttachmentSource(file: File) {
  return useCallback(
    (element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement | null) => {
      if (!element) return
      const url = URL.createObjectURL(file)
      element.src = url
      return () => URL.revokeObjectURL(url)
    },
    [file],
  )
}

export default function AttachmentPreview({
  file,
  thumbnail = false,
  onPdfLoad,
}: {
  file: File
  thumbnail?: boolean
  onPdfLoad?: (pages: number) => void
}) {
  const sourceRef = useAttachmentSource(file)
  const [failedFile, setFailedFile] = useState<File | null>(null)
  if (failedFile !== file && file.type.startsWith('image/'))
    return (
      <img
        ref={sourceRef}
        alt={thumbnail ? '' : file.name}
        onError={() => setFailedFile(file)}
        className="h-full w-full object-contain"
      />
    )
  if (failedFile !== file && file.type.startsWith('video/'))
    return (
      <video
        ref={sourceRef}
        controls={!thumbnail}
        muted={thumbnail}
        preload="metadata"
        onError={() => setFailedFile(file)}
        aria-label={file.name}
        className="h-full w-full object-contain"
      />
    )
  if (file.type.startsWith('audio/') && !thumbnail)
    // biome-ignore lint/a11y/useMediaCaption: Local user-selected audio has no supplied caption track.
    return <audio ref={sourceRef} controls aria-label={file.name} className="max-w-full" />
  if (file.type === 'application/pdf' && !thumbnail)
    return (
      <Suspense
        fallback={
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-5 motion-safe:animate-spin" />
            Carregando prévia…
          </div>
        }
      >
        <PdfFirstPagePreview
          key={file.name + file.lastModified + file.size}
          file={file}
          onLoad={onPdfLoad}
        />
      </Suspense>
    )
  return (
    <div className="flex flex-col items-center gap-3 p-2 text-center text-muted-foreground">
      <FileText aria-hidden="true" className={thumbnail ? 'size-6' : 'size-16 stroke-1'} />
      {!thumbnail && (
        <>
          <p className="max-w-sm break-all text-sm text-foreground">{file.name}</p>
          <p className="text-xs">
            {(file.size / 1024 / 1024).toFixed(1)} MiB · Sem prévia disponível
          </p>
        </>
      )}
    </div>
  )
}
