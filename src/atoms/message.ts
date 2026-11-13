import { atomWithMutation, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import {
  sendAudio,
  sendContact,
  sendDocument,
  sendImage,
  sendLocation,
  sendTestMessage,
  sendText,
  sendVideo,
} from '@/services/message'
import type {
  SendAudioMessageRequest,
  SendContactMessageRequest,
  SendDocumentMessageRequest,
  SendImageMessageRequest,
  SendLocationMessageRequest,
  SendTestMessageRequest,
  SendTextMessageRequest,
  SendVideoMessageRequest,
} from '@/services/types'
import { sessionKeys } from './session'

// --- Mutations ---

export const sendTextAtom = atomWithMutation((get) => ({
  mutationKey: ['sendText'],
  mutationFn: async ({ sessionId, req }: { sessionId: string; req: SendTextMessageRequest }) => {
    return await sendText(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Mensagem de texto enviada com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao enviar mensagem de texto')
  },
}))

export const sendAudioAtom = atomWithMutation((get) => ({
  mutationKey: ['sendAudio'],
  mutationFn: async ({ sessionId, req }: { sessionId: string; req: SendAudioMessageRequest }) => {
    return await sendAudio(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Audio message sent successfully')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to send audio message')
  },
}))

export const sendImageAtom = atomWithMutation((get) => ({
  mutationKey: ['sendImage'],
  mutationFn: async ({ sessionId, req }: { sessionId: string; req: SendImageMessageRequest }) => {
    return await sendImage(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Image message sent successfully')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to send image message')
  },
}))

export const sendVideoAtom = atomWithMutation((get) => ({
  mutationKey: ['sendVideo'],
  mutationFn: async ({ sessionId, req }: { sessionId: string; req: SendVideoMessageRequest }) => {
    return await sendVideo(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Video message sent successfully')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to send video message')
  },
}))

export const sendDocumentAtom = atomWithMutation((get) => ({
  mutationKey: ['sendDocument'],
  mutationFn: async ({
    sessionId,
    req,
  }: {
    sessionId: string
    req: SendDocumentMessageRequest
  }) => {
    return await sendDocument(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Document message sent successfully')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to send document message')
  },
}))

export const sendContactAtom = atomWithMutation((get) => ({
  mutationKey: ['sendContact'],
  mutationFn: async ({ sessionId, req }: { sessionId: string; req: SendContactMessageRequest }) => {
    return await sendContact(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Contact message sent successfully')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to send contact message')
  },
}))

export const sendLocationAtom = atomWithMutation((get) => ({
  mutationKey: ['sendLocation'],
  mutationFn: async ({
    sessionId,
    req,
  }: {
    sessionId: string
    req: SendLocationMessageRequest
  }) => {
    return await sendLocation(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Location message sent successfully')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Failed to send location message')
  },
}))

export const sendTestMessageAtom = atomWithMutation((get) => ({
  mutationKey: ['sendTestMessage'],
  mutationFn: ({ sessionId, req }: { sessionId: string; req: SendTestMessageRequest }) =>
    sendTestMessage(sessionId, req),
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: sessionKeys.history(variables.sessionId),
    })
    toast.success('Mensagem de teste enviada com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao enviar mensagem de teste')
  },
}))
