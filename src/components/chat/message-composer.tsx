import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ArrowUp, Loader2, Mic, Plus, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaLimitsAtom } from '@/atoms/media'
import { quickMessagesAtom } from '@/atoms/quick-messages'
import { sessionsAtom, updateSessionAtom } from '@/atoms/session'
import {
  chatDraftsAtom,
  chatQuickMessageManagerAtom,
  chatRepliesAtom,
  chatSessionIdAtom,
} from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { insertEmoji } from '@/lib/chat/emoji'
import {
  filterQuickMessages,
  type QuickMessage,
  quickMessageSearch,
} from '@/lib/chat/quick-messages'
import { messagePreview } from '@/lib/chat/types'
import EmojiMenu from './emoji-menu'
import QuickMessageManager from './quick-message-manager'
import QuickMessageMenu from './quick-message-menu'
import VoiceRecorder from './voice-recorder'

interface MessageComposerProps {
  draftKey: string
  disabled?: boolean
  onSend: (text: string, file?: File, voice?: boolean) => boolean | Promise<boolean>
  onAttach: (files: File[], caption: string) => boolean
}

export default function MessageComposer({
  draftKey,
  disabled,
  onSend,
  onAttach,
}: MessageComposerProps) {
  const [drafts, setDrafts] = useAtom(chatDraftsAtom)
  const mediaLimits = useAtomValue(mediaLimitsAtom)
  const maxFileSizeMb = mediaLimits.data?.maxFileSizeMb
  const draft = drafts[draftKey] ?? ''
  const [replies, setReplies] = useAtom(chatRepliesAtom)
  const reply = replies[draftKey]
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const sendLock = useRef(false)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const sessions = useAtomValue(sessionsAtom)
  const session = sessions.data?.data.find((item) => item.id === sessionId)
  const [{ mutate: updateSession, isPending: updatingSignature }] = useAtom(updateSessionAtom)
  const quickMessages = useAtomValue(quickMessagesAtom)
  const openManager = useSetAtom(chatQuickMessageManagerAtom)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [highlighted, setHighlighted] = useState('')
  const [menuAria, setMenuAria] = useState<{ listId: string; optionId: string | undefined } | null>(
    null,
  )
  const updateMenuAria = useCallback((listId: string, optionId: string | undefined) => {
    setMenuAria((previous) =>
      previous?.listId === listId && previous.optionId === optionId
        ? previous
        : { listId, optionId },
    )
  }, [])
  const search = quickMessageSearch(draft)
  const suggestions = filterQuickMessages(quickMessages.data ?? [], search ?? '')
  const menuOpen = !!sessionId && focused && !dismissed && search !== null && !recording && !sending
  const selected = suggestions.find((item) => item.id === highlighted) ?? suggestions[0]
  function insertQuickMessage(item: QuickMessage) {
    setDrafts((previous) => ({ ...previous, [draftKey]: item.message }))
    setDismissed(true)
    requestAnimationFrame(() => {
      textInput.current?.focus()
      textInput.current?.setSelectionRange(item.message.length, item.message.length)
    })
  }
  useEffect(() => {
    if (reply) textInput.current?.focus()
  }, [reply])
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  async function send() {
    if (
      disabled ||
      updatingSignature ||
      recording ||
      sendLock.current ||
      !draft.trim() ||
      draft.length > 4096
    )
      return
    sendLock.current = true
    setError(null)
    setSending(true)
    try {
      const sent = await onSend(draft)
      if (sent) {
        setDrafts((previous) =>
          previous[draftKey] === draft ? { ...previous, [draftKey]: '' } : previous,
        )
      } else
        setError(
          'Envio não confirmado. Atualize o histórico antes de tentar novamente para evitar duplicação.',
        )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem')
    } finally {
      sendLock.current = false
      setSending(false)
    }
  }
  return (
    <>
      <form
        className="relative z-10 shrink-0 border-0 bg-transparent px-3 pt-0 pb-3 md:px-4 md:pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        {error && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {menuOpen && (
          <QuickMessageMenu
            items={suggestions}
            selected={selected?.id ?? ''}
            onSelect={insertQuickMessage}
            onHighlight={setHighlighted}
            loading={quickMessages.isPending}
            error={quickMessages.error}
            onRetry={() => {
              void quickMessages.refetch()
            }}
            onActiveItemChange={updateMenuAria}
          />
        )}
        <div className="overflow-hidden rounded-lg border border-input bg-card shadow-md focus-within:ring-2 focus-within:ring-ring/50">
          {reply && (
            <div
              role="status"
              className="mx-3 mt-3 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-muted px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-primary">
                  Respondendo a {reply.fromMe ? 'você' : reply.sender.name || 'contato'}
                </p>
                <p className="truncate text-sm text-muted-foreground">{messagePreview(reply)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cancelar resposta"
                onClick={() => setReplies((previous) => ({ ...previous, [draftKey]: undefined }))}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          )}
          {recording ? (
            <VoiceRecorder
              disabled={disabled}
              onSend={(file) => onSend('', file, true)}
              onClose={() => {
                setRecording(false)
                requestAnimationFrame(() => textInput.current?.focus())
              }}
            />
          ) : (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                aria-label="Anexar arquivo"
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  setError(null)
                  if (!selected.length) return
                  if (onAttach(selected, draft))
                    setDrafts((previous) =>
                      previous[draftKey] === draft ? { ...previous, [draftKey]: '' } : previous,
                    )
                  else
                    setError(
                      maxFileSizeMb
                        ? `Arquivos vazios ou maiores que ${maxFileSizeMb} MiB não podem ser adicionados. Selecione outros arquivos.`
                        : 'Limite de arquivos indisponível. Recarregue a página para tentar novamente.',
                    )
                }}
              />
              <Textarea
                ref={textInput}
                role="combobox"
                aria-label="Mensagem"
                placeholder="Escreva uma mensagem…"
                rows={1}
                maxLength={4096}
                value={draft}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuAria?.listId : undefined}
                aria-activedescendant={menuOpen ? menuAria?.optionId : undefined}
                aria-autocomplete="list"
                onChange={(event) => {
                  setDismissed(false)
                  setHighlighted('')
                  setDrafts((previous) => ({ ...previous, [draftKey]: event.target.value }))
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (menuOpen) {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setDismissed(true)
                      return
                    }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      const index = suggestions.findIndex((item) => item.id === selected?.id)
                      const next =
                        suggestions[
                          (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) %
                            suggestions.length
                        ]
                      if (next) setHighlighted(next.id)
                      return
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (selected && !quickMessages.error) insertQuickMessage(selected)
                      return
                    }
                  }
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void send()
                  }
                }}
                className="max-h-36 min-h-12 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <TooltipProvider>
                <div className="flex items-center gap-1 px-2 pb-2">
                  <EmojiMenu
                    key={draftKey}
                    disabled={sending || !!disabled}
                    onOpen={() => setDismissed(true)}
                    onSelect={(emoji) => {
                      const input = textInput.current
                      if (!input || sending || disabled) return
                      const result = insertEmoji(
                        draft,
                        emoji,
                        input.selectionStart,
                        input.selectionEnd,
                      )
                      if (!result) {
                        setError('O emoji excede o limite de 4.096 caracteres da mensagem.')
                        return
                      }
                      setError(null)
                      setDrafts((previous) => ({ ...previous, [draftKey]: result.value }))
                      requestAnimationFrame(() => {
                        input.setSelectionRange(result.cursor, result.cursor)
                      })
                    }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Selecionar anexo"
                        disabled={sending || disabled || !maxFileSizeMb}
                        onClick={() => fileInput.current?.click()}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {maxFileSizeMb
                        ? `Anexar arquivos (até ${maxFileSizeMb} MiB cada)`
                        : mediaLimits.isError
                          ? 'Limite indisponível; recarregue a página'
                          : 'Carregando limite de arquivos'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Gravar áudio"
                        disabled={sending || disabled || !maxFileSizeMb}
                        onClick={() => {
                          setError(null)
                          setRecording(true)
                        }}
                      >
                        <Mic aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Gravar mensagem de voz</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Mensagens rápidas"
                        disabled={!sessionId}
                        onClick={() => {
                          if (sessionId) openManager(sessionId)
                        }}
                      >
                        <Zap aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Gerenciar mensagens rápidas</TooltipContent>
                  </Tooltip>
                  {session && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="ml-1 flex min-w-0 items-center gap-2">
                          <Switch
                            id="chat-sign-message"
                            checked={session.config.signatureEnabled}
                            disabled={
                              sending ||
                              disabled ||
                              updatingSignature ||
                              !session.config.signatureName.trim()
                            }
                            onCheckedChange={(checked) => {
                              updateSession({
                                id: session.id,
                                req: { config: { signatureEnabled: checked } },
                              })
                            }}
                          />
                          <Label htmlFor="chat-sign-message" className="text-xs">
                            Assinar mensagem
                          </Label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {session.config.signatureName ||
                          'Defina o nome da assinatura nas configurações da sessão'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="submit"
                        size="icon-lg"
                        className="ml-auto rounded-full"
                        disabled={disabled || sending || updatingSignature || !draft.trim()}
                        aria-label="Enviar mensagem"
                      >
                        {sending ? (
                          <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                        ) : (
                          <ArrowUp aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Enviar mensagem</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </>
          )}
        </div>
        {(disabled || draft.length > 3600) && (
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {disabled && <span>Envio indisponível · rascunho preservado</span>}
            {draft.length > 3600 && (
              <span className="ml-auto shrink-0 tabular-nums">{draft.length}/4096</span>
            )}
          </div>
        )}
      </form>
      <QuickMessageManager />
    </>
  )
}
