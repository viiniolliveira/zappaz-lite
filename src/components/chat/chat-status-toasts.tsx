import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useEffectEvent, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  chatConnectionStatusAtom,
  chatConversationPagesAtom,
  chatMessagePagesAtom,
  chatReconnectAttemptAtom,
  chatSessionStateAtom,
  chatSubscribedSessionIdAtom,
} from '@/atoms/chat-cache'
import { acknowledgeChatSyncErrorAtom } from '@/atoms/realtime-chat'
import { chatSessionIdAtom } from '@/atoms/ui'

function SessionStatusToasts({ sessionId }: { sessionId: string }) {
  const status = useAtomValue(chatConnectionStatusAtom)
  const state = useAtomValue(chatSessionStateAtom)
  const subscribedSessionId = useAtomValue(chatSubscribedSessionIdAtom)
  const session = subscribedSessionId === sessionId ? state : null
  const conversations = useAtomValue(chatConversationPagesAtom)
  const messages = useAtomValue(chatMessagePagesAtom)
  const messagesEnabled = messages.isEnabled
  const reconnect = useSetAtom(chatReconnectAttemptAtom)
  const navigate = useNavigate()
  const acknowledgeSyncError = useSetAtom(acknowledgeChatSyncErrorAtom)
  const wasSyncing = useRef(false)
  const previousConnection = useRef(status)
  const previousWhatsApp = useRef<boolean | null>(null)
  const connectionId = `chat:${sessionId}:connection`
  const whatsappId = `chat:${sessionId}:whatsapp`
  const syncId = `chat:${sessionId}:sync`
  const historyId = `chat:${sessionId}:history`
  const reloadHistory = useEffectEvent(() => {
    void conversations.refetch()
    if (messagesEnabled) void messages.refetch()
  })

  useEffect(
    () => () => {
      for (const id of [connectionId, whatsappId, syncId, historyId]) toast.dismiss(id)
    },
    [connectionId, whatsappId, syncId, historyId],
  )

  useEffect(() => {
    const previous = previousConnection.current
    previousConnection.current = status
    const options = {
      id: connectionId,
      duration: Infinity,
      action: undefined,
      description: undefined,
    }
    switch (status) {
      case 'connecting':
        toast.loading('Conectando ao chat…', options)
        break
      case 'open':
        if (previous !== 'open')
          toast.success('Conexão com o chat estabelecida', { ...options, duration: 4000 })
        break
      case 'closed':
      case 'error':
        toast.error('Conexão com o chat interrompida', {
          ...options,
          description: 'As atualizações em tempo real estão indisponíveis.',
          action: { label: 'Reconectar', onClick: () => reconnect((attempt) => attempt + 1) },
        })
        break
      case 'unauthorized':
        toast.error('Autenticação expirada', {
          ...options,
          action: { label: 'Entrar', onClick: () => navigate('/sign-in') },
        })
        break
      case 'forbidden':
        toast.error('Sem acesso a esta sessão', options)
        break
      default:
        toast.dismiss(connectionId)
    }
  }, [status, connectionId, reconnect, navigate])

  const connected = session ? session.connected && session.enabled : null
  useEffect(() => {
    const previous = previousWhatsApp.current
    previousWhatsApp.current = connected
    if (connected === null) {
      toast.dismiss(whatsappId)
    } else if (!connected) {
      toast.warning('WhatsApp desconectado', {
        id: whatsappId,
        duration: Infinity,
        action: { label: 'Abrir sessão', onClick: () => navigate(`/sessions/${sessionId}`) },
      })
    } else if (previous === false) {
      toast.success('WhatsApp conectado', { id: whatsappId, duration: 4000, action: undefined })
    }
  }, [connected, whatsappId, navigate, sessionId])

  const syncStatus = session?.syncStatus
  const phase = session?.syncProgress?.phase
  const count = session?.syncProgress?.messages
  const errorId = session?.syncProgress?.errorId
  useEffect(() => {
    const options = {
      id: syncId,
      duration: Infinity,
      action: undefined,
      description: undefined,
      closeButton: false,
    }
    if (phase === 'saving') {
      wasSyncing.current = true
      const progress =
        count === undefined
          ? ''
          : `${count.toLocaleString('pt-BR')} mensagens processadas (inclui reprocessamentos).`
      toast.loading('Sincronizando histórico…', {
        ...options,
        description:
          syncStatus === 'error'
            ? `${progress} Houve uma falha parcial; os próximos lotes continuam sendo processados.`.trim()
            : progress || undefined,
      })
    } else if (syncStatus === 'error' || phase === 'error') {
      wasSyncing.current = false
      const acknowledge = () => {
        if (errorId) void acknowledgeSyncError({ sessionId, errorId })
      }
      toast.warning('Histórico sincronizado parcialmente', {
        ...options,
        closeButton: true,
        description: 'Houve uma falha na importação. Os dados já salvos foram preservados.',
        onDismiss: acknowledge,
        action: {
          label: 'Recarregar histórico',
          onClick: () => {
            acknowledge()
            reloadHistory()
          },
        },
      })
    } else if (phase === 'complete') {
      toast.dismiss(syncId)
      if (wasSyncing.current)
        toast.success('Histórico disponibilizado pelo WhatsApp sincronizado', {
          ...options,
          duration: 5000,
        })
      wasSyncing.current = false
    } else if (syncStatus === 'syncing' || phase === 'waiting') {
      wasSyncing.current = true
      toast.loading(
        phase === 'waiting' ? 'Aguardando histórico do WhatsApp…' : 'Sincronizando histórico…',
        {
          ...options,
          description:
            count === undefined
              ? undefined
              : `${count.toLocaleString('pt-BR')} mensagens processadas (inclui reprocessamentos).`,
        },
      )
    } else {
      wasSyncing.current = false
      toast.dismiss(syncId)
    }
  }, [syncStatus, phase, count, syncId, errorId, sessionId, acknowledgeSyncError])

  const error = conversations.error ?? messages.error
  useEffect(() => {
    if (!error || status !== 'open') {
      toast.dismiss(historyId)
      return
    }
    toast.error('Erro ao carregar histórico', {
      id: historyId,
      duration: Infinity,
      description: error.message,
      action: { label: 'Recarregar histórico', onClick: () => reloadHistory() },
    })
  }, [error, status, historyId])

  return null
}

export default function ChatStatusToasts() {
  const sessionId = useAtomValue(chatSessionIdAtom)
  return sessionId ? <SessionStatusToasts key={sessionId} sessionId={sessionId} /> : null
}
