import { ChevronDown, ChevronUp, Loader2, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const pdfOptions = {
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  // Binary data and auxiliary assets stay on this origin; no Blob fetch or external viewer.
  useWorkerFetch: false,
}
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

export default function PdfDocument({ blob }: { blob: Blob }) {
  const viewport = useRef<HTMLElement>(null)
  const activePage = useRef(1)
  const [file, setFile] = useState<{ data: Uint8Array } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry needs a fresh buffer because PDF.js transfers ownership to its worker.
  useEffect(() => {
    let cancelled = false
    setFile(null)
    setError(null)
    setPages(0)
    setPage(1)
    activePage.current = 1
    void blob
      .arrayBuffer()
      .then((data) => {
        if (!cancelled) setFile({ data: new Uint8Array(data) })
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível ler o PDF. Tente novamente ou baixe o arquivo.')
      })
    return () => {
      cancelled = true
    }
  }, [blob, attempt])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(1, Math.min(1000, entry.contentRect.width - 32)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = viewport.current
    if (!element || !pages) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const number = Number((entry.target as HTMLElement).dataset.pdfPage)
            activePage.current = number
            setPage(number)
            setPageInput(null)
          }
        }
      },
      { root: element, rootMargin: '-10% 0px -70% 0px' },
    )
    for (const item of element.querySelectorAll('[data-pdf-page]')) observer.observe(item)
    return () => observer.disconnect()
  }, [pages])

  const goToPage = useCallback(
    (number: number) => {
      if (!Number.isFinite(number) || !pages) {
        setPageInput(null)
        return
      }
      const next = Math.max(1, Math.min(pages, Math.trunc(number)))
      activePage.current = next
      viewport.current
        ?.querySelector(`[data-pdf-page="${next}"]`)
        ?.scrollIntoView({ block: 'start' })
      setPage(next)
      setPageInput(null)
    },
    [pages],
  )

  useLayoutEffect(() => {
    if (width && zoom) goToPage(activePage.current)
  }, [width, zoom, goToPage])

  return (
    <>
      <section
        ref={viewport}
        aria-label="Páginas do PDF"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/20 outline-none [scrollbar-color:var(--border)_var(--background)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {error ? (
          <div
            role="alert"
            className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm"
          >
            <p>{error}</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : file && width ? (
          <Document
            key={attempt}
            file={file}
            options={pdfOptions}
            suspense={false}
            className="flex w-max min-w-full flex-col items-center gap-4 p-4 pb-28 md:pb-8"
            loading={<PdfLoading />}
            error={<p role="alert">Não foi possível abrir o PDF.</p>}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            onLoadError={() =>
              setError(
                'Não foi possível abrir este PDF. O arquivo pode estar danificado. Você ainda pode baixá-lo.',
              )
            }
            onSourceError={() =>
              setError('Não foi possível ler o PDF. Tente novamente ou baixe o arquivo.')
            }
            onPassword={() =>
              setError(
                'Este PDF é protegido por senha. Baixe o arquivo para abri-lo em um aplicativo compatível.',
              )
            }
            externalLinkTarget="_blank"
            externalLinkRel="noopener noreferrer nofollow"
            onItemClick={({ pageNumber }) => {
              if (pageNumber) goToPage(pageNumber)
            }}
          >
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <PdfPage
                key={number}
                number={number}
                width={width * zoom}
                viewport={viewport.current}
              />
            ))}
          </Document>
        ) : (
          <PdfLoading />
        )}
      </section>
      {pages > 0 && !error && (
        <nav
          aria-label="Controles do PDF"
          className="absolute right-3 bottom-3 left-3 flex items-center justify-center gap-1 rounded-xl border bg-background p-2 shadow-md md:right-5 md:bottom-5 md:left-auto md:flex-col"
        >
          <div className="flex items-center gap-1 text-xs md:flex-col">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={pages}
              value={pageInput ?? page}
              aria-label="Página do PDF"
              className="h-8 w-14 text-center tabular-nums"
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => {
                if (pageInput !== null) goToPage(Number(pageInput))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  goToPage(Number(pageInput ?? page))
                }
              }}
            />
            <span className="px-1 text-muted-foreground tabular-nums">/ {pages}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page <= 1}
            aria-label="Página anterior"
            title="Página anterior"
            onClick={() => goToPage(page - 1)}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page >= pages}
            aria-label="Próxima página"
            title="Próxima página"
            onClick={() => goToPage(page + 1)}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
          <span
            aria-hidden="true"
            className="mx-1 h-6 border-l md:my-1 md:h-0 md:w-6 md:border-t md:border-l-0"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={zoom >= MAX_ZOOM}
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={zoom <= MIN_ZOOM}
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ajustar à largura"
            title="Ajustar à largura"
            onClick={() => setZoom(1)}
          >
            <Maximize2 aria-hidden="true" />
          </Button>
          <output
            aria-label="Zoom do PDF"
            className="hidden text-xs text-muted-foreground tabular-nums md:block"
          >
            {Math.round(zoom * 100)}%
          </output>
        </nav>
      )}
    </>
  )
}

function PdfPage({
  number,
  width,
  viewport,
}: {
  number: number
  width: number
  viewport: HTMLElement | null
}) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [ratio, setRatio] = useState(Math.SQRT2)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: viewport,
      rootMargin: '800px 0px',
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [viewport])
  return (
    <section
      ref={ref}
      data-pdf-page={number}
      aria-label={`Página ${number}`}
      className="relative shrink-0 scroll-mt-4 bg-white text-black shadow-sm"
      style={{ width, minHeight: width * ratio }}
    >
      {visible &&
        (failed ? (
          <div role="alert" className="flex flex-col items-center gap-3 p-6 text-sm">
            <p>Não foi possível renderizar a página {number}.</p>
            <Button variant="outline" onClick={() => setFailed(false)}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <Page
            pageNumber={number}
            width={width}
            devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
            loading={<PdfLoading />}
            error={<p role="alert">Não foi possível renderizar esta página.</p>}
            onLoadSuccess={(page) => {
              const size = page.getViewport({ scale: 1 })
              setRatio(size.height / size.width)
            }}
            onLoadError={() => setFailed(true)}
            onRenderError={() => setFailed(true)}
          />
        ))}
    </section>
  )
}

function PdfLoading() {
  return (
    <div role="status" className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm">
      <Loader2 aria-hidden="true" className="size-5 motion-safe:animate-spin" />
      Carregando PDF…
    </div>
  )
}

export function PdfFirstPagePreview({
  file,
  onLoad,
}: {
  file: File
  onLoad?: (pages: number) => void
}) {
  const container = useRef<HTMLElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [ratio, setRatio] = useState(Math.SQRT2)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const width = Math.max(0, Math.min(size.width, size.height / ratio))
  return (
    <section
      ref={container}
      aria-label={`Primeira página de ${file.name}`}
      data-slot="pdf-first-page-preview"
      className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden p-3"
    >
      {error ? (
        <div
          role="alert"
          className="flex max-w-sm flex-col items-center gap-3 p-3 text-center text-sm"
        >
          <p>{error}</p>
          <p className="text-xs text-muted-foreground">Você ainda pode enviar o arquivo.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError(null)
              setAttempt((value) => value + 1)
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : width > 0 ? (
        <Document
          key={attempt}
          file={file}
          options={pdfOptions}
          suspense={false}
          loading={<PdfLoading />}
          error={<p role="alert">Prévia indisponível.</p>}
          onLoadSuccess={({ numPages }) => onLoad?.(numPages)}
          onLoadError={() => setError('Não foi possível carregar a prévia deste PDF.')}
          onSourceError={() => setError('Não foi possível ler o PDF selecionado.')}
          onPassword={() =>
            setError('Este PDF é protegido por senha. A prévia não está disponível.')
          }
        >
          <Page
            pageNumber={1}
            width={width}
            devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<PdfLoading />}
            error={<p role="alert">Prévia indisponível.</p>}
            onLoadSuccess={(page) => {
              const viewport = page.getViewport({ scale: 1 })
              setRatio(viewport.height / viewport.width)
            }}
            onLoadError={() => setError('Não foi possível renderizar a primeira página.')}
            onRenderError={() => setError('Não foi possível renderizar a primeira página.')}
          />
        </Document>
      ) : (
        <PdfLoading />
      )}
    </section>
  )
}
