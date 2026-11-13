import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { mediaMaxFileSizeBytesAtom } from '@/atoms/media'

export interface PendingAttachment {
  id: string
  original: File
  file: File
  caption: string
  uncertain: boolean
}

export function useAttachmentQueue(
  onSend: (text: string, file?: File) => boolean | Promise<boolean>,
  disabled?: boolean,
) {
  const maxFileSizeBytes = useAtomValue(mediaMaxFileSizeBytesAtom)
  const maxFileSizeMb = maxFileSizeBytes === null ? null : maxFileSizeBytes / 1024 / 1024
  const [items, setItems] = useState<PendingAttachment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const active = useRef(true)
  const unavailable = useRef(disabled)
  useEffect(() => {
    unavailable.current = disabled
  }, [disabled])
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  function add(files: File[], caption = '') {
    if (busy.current) return
    if (maxFileSizeBytes === null) {
      setError('Limite de arquivos indisponível. Recarregue a página para tentar novamente.')
      return false
    }
    const valid = files.filter((file) => file.size > 0 && file.size <= maxFileSizeBytes)
    setError(
      valid.length !== files.length
        ? `Alguns arquivos estão vazios ou excedem ${maxFileSizeMb} MiB e não foram adicionados.`
        : null,
    )
    const added = valid.map((file, index) => ({
      id: crypto.randomUUID(),
      original: file,
      file,
      caption: index === 0 ? caption : '',
      uncertain: false,
    }))
    setItems((previous) => [...previous, ...added])
    if (added[0]) setSelectedId(added[0].id)
    return added.length > 0
  }
  function update(id: string, changes: Partial<Pick<PendingAttachment, 'file' | 'caption'>>) {
    if (busy.current) return
    setItems((previous) =>
      previous.map((item) => (item.id === id && !item.uncertain ? { ...item, ...changes } : item)),
    )
  }
  function remove(id: string) {
    if (!busy.current) setItems((previous) => previous.filter((item) => item.id !== id))
  }
  function clear() {
    if (busy.current) return
    setItems([])
    setSelectedId(null)
    setError(null)
  }
  async function send() {
    if (
      busy.current ||
      disabled ||
      maxFileSizeBytes === null ||
      !items.length ||
      items.some(
        (item) => item.uncertain || item.caption.length > 4096 || item.file.size > maxFileSizeBytes,
      )
    )
      return
    busy.current = true
    setSending(true)
    setError(null)
    try {
      for (const item of items) {
        if (!active.current || unavailable.current) break
        let confirmed = false
        let failureMessage = ''
        try {
          confirmed = await onSend(item.caption, item.file)
        } catch (cause) {
          failureMessage =
            cause instanceof Error ? cause.message : 'Não foi possível confirmar o envio.'
        }
        if (!active.current) break
        if (!confirmed) {
          setItems((previous) =>
            previous.map((current) =>
              current.id === item.id ? { ...current, uncertain: true } : current,
            ),
          )
          setError(
            `${failureMessage ? `${failureMessage} ` : ''}Envio não confirmado. Confira o histórico antes de remover este arquivo da fila; ele não será reenviado automaticamente.`,
          )
          setSelectedId(item.id)
          break
        }
        setItems((previous) => previous.filter((current) => current.id !== item.id))
      }
    } finally {
      busy.current = false
      if (active.current) setSending(false)
    }
  }
  return {
    maxFileSizeBytes,
    maxFileSizeMb,
    items,
    selected,
    setSelectedId,
    sending,
    error,
    setError,
    add,
    update,
    remove,
    clear,
    send,
  }
}
