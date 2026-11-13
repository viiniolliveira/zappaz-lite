import { Loader2, Pencil, Plus, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { insertEmoji } from '@/lib/chat/emoji'
import { cn } from '@/lib/utils'
import AttachmentPreview from './attachment-preview'
import EmojiMenu from './emoji-menu'
import MessageComposer from './message-composer'
import { useAttachmentQueue } from './use-attachment-queue'

const AttachmentImageEditor = lazy(() => import('./attachment-image-editor'))
const editableTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default function AttachmentWorkspace({
  children,
  draftKey,
  disabled,
  onSend,
}: {
  children: ReactNode
  draftKey: string
  disabled?: boolean
  onSend: (text: string, file?: File, voice?: boolean) => boolean | Promise<boolean>
}) {
  const queue = useAttachmentQueue(onSend, disabled)
  const [editing, setEditing] = useState(false)
  const [discard, setDiscard] = useState<'all' | 'edit' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)
  const [captionError, setCaptionError] = useState<{ itemId: string; message: string } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const composeRef = useRef<HTMLDivElement>(null)
  const previousOpen = useRef(false)
  const open = queue.items.length > 0
  const selected = queue.selected
  const selectedFile = selected?.file
  const isPdf = selectedFile?.type === 'application/pdf'
  const [pdfInfo, setPdfInfo] = useState<{ file: File; pages: number } | null>(null)
  const onPdfLoad = useCallback(
    (pages: number) => {
      if (selectedFile)
        setPdfInfo((current) =>
          current?.file === selectedFile && current.pages === pages
            ? current
            : { file: selectedFile, pages },
        )
    },
    [selectedFile],
  )
  const pdfPages = pdfInfo?.file === selectedFile ? pdfInfo?.pages : undefined
  useEffect(() => {
    if (open && !previousOpen.current) headingRef.current?.focus()
    if (!open && previousOpen.current)
      composeRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="Selecionar anexo"]')
        ?.focus()
    previousOpen.current = open
  }, [open])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={composeRef}
        className={cn('min-h-0 flex-1 flex-col', open ? 'hidden' : 'flex')}
        inert={open}
      >
        {children}
        <MessageComposer
          draftKey={draftKey}
          disabled={disabled}
          onSend={onSend}
          onAttach={(files, caption) => queue.add(files, caption) ?? false}
        />
      </div>
      {open && selected && (
        <section
          aria-label="Preparar envio de arquivos"
          className="flex min-h-0 flex-1 flex-col bg-background"
          aria-busy={queue.sending}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented && !editing && !queue.sending) {
              event.preventDefault()
              setDiscard('all')
            }
          }}
        >
          {!editing && (
            <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2 md:px-5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancelar envio de arquivos"
                disabled={queue.sending}
                onClick={() => setDiscard('all')}
              >
                <X aria-hidden="true" />
              </Button>
              <div className="min-w-0 flex-1">
                <h3
                  ref={headingRef}
                  tabIndex={-1}
                  className="truncate text-sm font-medium outline-none"
                  title={isPdf ? selected.file.name : undefined}
                >
                  {isPdf ? selected.file.name : 'Preparar envio'}
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {isPdf
                    ? pdfPages
                      ? `${pdfPages} ${pdfPages === 1 ? 'página' : 'páginas'}`
                      : 'PDF'
                    : selected.file.name}
                </p>
              </div>
              {selected.file !== selected.original && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Restaurar imagem original"
                  disabled={queue.sending || selected.uncertain}
                  onClick={() => queue.update(selected.id, { file: selected.original })}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              )}
              {editableTypes.has(selected.file.type) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={queue.sending || selected.uncertain}
                  onClick={() => setEditing(true)}
                >
                  <Pencil aria-hidden="true" />
                  Editar
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover arquivo selecionado"
                disabled={queue.sending}
                onClick={() => queue.remove(selected.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </header>
          )}
          {queue.error && (
            <p role="alert" className="shrink-0 px-4 py-2 text-xs text-destructive">
              {queue.error}
            </p>
          )}
          {editing ? (
            <Suspense
              fallback={
                <p role="status" className="p-6 text-sm text-muted-foreground">
                  Carregando editor…
                </p>
              }
            >
              <AttachmentImageEditor
                key={selected.id}
                file={selected.file}
                onApply={(file) => {
                  queue.update(selected.id, { file })
                  setEditing(false)
                }}
                onCancel={() => setDiscard('edit')}
              />
            </Suspense>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 p-3 md:p-6">
                <AttachmentPreview key={selected.id} file={selected.file} onPdfLoad={onPdfLoad} />
              </div>
              <div className="shrink-0 space-y-3 border-t p-3 md:px-5 md:py-4">
                <div className="relative min-w-0">
                  <Textarea
                    key={selected.id}
                    ref={captionRef}
                    aria-label="Legenda do arquivo"
                    placeholder="Adicione uma legenda…"
                    rows={1}
                    maxLength={4096}
                    value={selected.caption}
                    disabled={queue.sending || selected.uncertain}
                    onChange={(event) => {
                      setCaptionError(null)
                      queue.update(selected.id, { caption: event.target.value })
                    }}
                    className="max-h-24 min-h-11 resize-none bg-muted/30 pr-12 shadow-none"
                  />
                  <div className="absolute right-0.5 bottom-0.5">
                    <TooltipProvider>
                      <EmojiMenu
                        key={selected.id}
                        disabled={queue.sending || selected.uncertain || !!disabled}
                        onSelect={(emoji) => {
                          const input = captionRef.current
                          if (!input || queue.sending || selected.uncertain || disabled) return
                          const result = insertEmoji(
                            selected.caption,
                            emoji,
                            input.selectionStart,
                            input.selectionEnd,
                          )
                          if (!result) {
                            setCaptionError({
                              itemId: selected.id,
                              message: 'O emoji excede o limite de 4.096 caracteres da legenda.',
                            })
                            return
                          }
                          setCaptionError(null)
                          queue.update(selected.id, { caption: result.value })
                          requestAnimationFrame(() => {
                            input.setSelectionRange(result.cursor, result.cursor)
                          })
                        }}
                      />
                    </TooltipProvider>
                  </div>
                </div>
                {captionError?.itemId === selected.id && (
                  <p role="alert" className="text-xs text-destructive">
                    {captionError.message}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <fieldset
                    aria-label="Arquivos para enviar"
                    className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1"
                  >
                    {queue.items.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Selecionar arquivo ${index + 1}: ${item.file.name}`}
                        aria-pressed={item.id === selected.id}
                        disabled={queue.sending}
                        onClick={() => queue.setSelectedId(item.id)}
                        className={cn(
                          'relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-muted/30 p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50',
                          item.id === selected.id ? 'border-primary' : 'border-transparent',
                          item.uncertain && 'border-destructive',
                        )}
                      >
                        <AttachmentPreview file={item.file} thumbnail />
                        {item.uncertain && <span className="sr-only">Envio não confirmado</span>}
                      </button>
                    ))}
                    <Button
                      variant="outline"
                      className="size-14 shrink-0"
                      aria-label="Adicionar arquivos"
                      disabled={queue.sending}
                      onClick={() => inputRef.current?.click()}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </fieldset>
                  <Button
                    size="icon-lg"
                    className="size-12 shrink-0 rounded-full"
                    aria-label={`Enviar ${queue.items.length} arquivo${queue.items.length > 1 ? 's' : ''}`}
                    disabled={
                      disabled ||
                      queue.sending ||
                      queue.items.some((item) => item.uncertain || item.caption.length > 4096)
                    }
                    onClick={() => {
                      void queue.send()
                    }}
                  >
                    {queue.sending ? (
                      <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                    ) : (
                      <Send aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <p role="status" className="text-xs text-muted-foreground">
                  {queue.sending
                    ? `Enviando… ${queue.items.length} arquivo(s) restante(s)`
                    : disabled
                      ? 'Envio indisponível · arquivos preservados enquanto esta conversa estiver aberta'
                      : `${queue.items.length} arquivo(s) · até ${queue.maxFileSizeMb ?? '…'} MiB por arquivo · legenda individual`}
                </p>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            aria-label="Adicionar mais arquivos"
            onChange={(event) => {
              queue.add(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </section>
      )}
      <Dialog
        open={discard !== null}
        onOpenChange={(value) => {
          if (!value) setDiscard(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {discard === 'edit' ? 'Descartar esta edição?' : 'Descartar arquivos?'}
            </DialogTitle>
            <DialogDescription>
              {discard === 'edit'
                ? 'As alterações não aplicadas serão perdidas. O arquivo anterior será mantido.'
                : 'Os arquivos e as legendas desta fila serão removidos. Mensagens já enviadas não serão apagadas.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscard(null)}>
              Continuar preparando
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (discard === 'all') queue.clear()
                setEditing(false)
                setDiscard(null)
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
