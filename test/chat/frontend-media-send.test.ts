import { afterEach, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStore } from 'jotai/vanilla'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import type { InternalAxiosRequestConfig } from 'axios'
import MessageMedia from '../../src/components/chat/messages/message-media.tsx'
import { applyChatMessagesAtom, chatConnectionStatusAtom, chatLiveCacheAtom, chatOptimisticMessagesAtom, chatSessionStateAtom } from '../../src/atoms/chat-cache.ts'
import { sendApiChatTextAtom } from '../../src/atoms/chat-send.ts'
import { chatRepliesAtom, chatSessionIdAtom } from '../../src/atoms/ui.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'
import { mockThumbnailBase64 } from './mock-thumbnail.ts'
import { api } from '../../src/lib/api-client.ts'

const conversationId = mockConversations[0].id
const originalAdapter = api.defaults.adapter
afterEach(() => { api.defaults.adapter = originalAdapter })

function readyStore() {
  const store = createStore()
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false, staleTime: Infinity } } })
  queryClient.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
  store.set(queryClientAtom, queryClient)
  store.set(chatSessionIdAtom, mockSessionId)
  store.set(chatConnectionStatusAtom, 'open')
  store.set(chatSessionStateAtom, { connected: true, enabled: true, syncStatus: 'idle' })
  return store
}

describe('demand media server rendering', () => {
  test('shows the real JPEG thumbnail for unsaved mock media without requesting a download', () => {
    let requests = 0
    api.defaults.adapter = async () => { requests++; throw new Error('unexpected request') }
    const media = mockConversations[0].messages.find(message => message.type === 'image')?.media
    if (!media) throw new Error('missing image fixture')
    const html = renderToStaticMarkup(createElement(MessageMedia, { media }))
    expect(media.storageStatus).toBe('not_saved')
    expect(Buffer.from(mockThumbnailBase64, 'base64').subarray(0, 3).toString('hex')).toBe('ffd8ff')
    expect(html).toContain(`data:image/jpeg;base64,${mockThumbnailBase64}`)
    expect(html).not.toContain('Arquivo demonstrativo')
    expect(html).not.toContain('role="alert"')
    expect(requests).toBe(0)
  })

  test('shows a placeholder without a thumbnail and makes no SSR download', () => {
    let requests = 0
    api.defaults.adapter = async () => { requests++; throw new Error('unexpected request') }
    const media = mockConversations[0].messages.find(message => message.type === 'document')?.media
    if (!media) throw new Error('missing document fixture')
    const html = renderToStaticMarkup(createElement(MessageMedia, { media }))
    expect(html).toContain('exemplo.pdf')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('role="alert"')
    expect(requests).toBe(0)
  })
})

describe('media sending', () => {
  test('unavailable limits block attachments but not text', async () => {
    const store = readyStore()
    store.set(queryClientAtom, new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }))
    let sends = 0
    api.defaults.adapter = async config => {
      if (config.url?.includes('/media/limits')) throw new Error('limits unavailable')
      sends++
      const request = JSON.parse(config.data)
      const message = mockMessage(513, conversationId, { clientRequestId: request.clientRequestId, fromMe: true, text: request.text })
      return { data: { status: 'success', data: message }, status: 200, statusText: 'OK', headers: {}, config }
    }
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: '', file: new File(['x'], 'file.pdf') })).toBe(false)
    expect(sends).toBe(0)
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'text still works' })).toBe(true)
    expect(sends).toBe(1)
  })
  test('explicit interactive reply sends the selected text and original message while preserving the composer reply', async () => {
    const store = readyStore()
    const original = mockMessage(510, conversationId, { text: 'Escolha', interactive: { title: null, footer: null, buttons: [{ kind: 'reply', text: 'Sim', id: 'yes', url: null }] } })
    const draftReply = mockMessage(511, conversationId, { text: 'Outra mensagem' })
    const replyKey = `${mockSessionId}/${conversationId}`
    store.set(chatRepliesAtom, { [replyKey]: draftReply })
    let request: { text: string; clientRequestId: string; replyToMessageRecordId: string } | undefined
    api.defaults.adapter = async config => {
      request = JSON.parse(config.data)
      const message = mockMessage(512, conversationId, { clientRequestId: request!.clientRequestId, fromMe: true, text: 'Sim' })
      return { data: { status: 'success', data: message }, status: 200, statusText: 'OK', headers: {}, config }
    }
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'Sim', replyTo: original })).toBe(true)
    expect(request).toMatchObject({ text: 'Sim', replyToMessageRecordId: original.id })
    expect(store.get(chatRepliesAtom)[replyKey]).toEqual(draftReply)
  })
  test('sets voice=true only for voice audio uploads', async () => {
    const store = readyStore()
    const forms: FormData[] = []
    api.defaults.adapter = async config => {
      const form: FormData = config.data
      forms.push(form)
      const message = mockMessage(502, conversationId, { clientRequestId: String(form.get('clientRequestId')), fromMe: true, type: 'audio' })
      return { data: { status: 'success', data: message }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const file = new File(['audio'], 'voice.webm', { type: 'audio/webm' })
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: '', file, voice: true })).toBe(true)
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: '', file })).toBe(true)
    expect(forms[0].get('file')).toEqual(file)
    expect(forms[0].get('kind')).toBe('audio')
    expect(forms[0].get('caption')).toBe('')
    expect(forms[0].get('voice')).toBe('true')
    expect(forms[1].has('voice')).toBe(false)
  })
  test('reconciles a socket confirmation before an HTTP failure without duplication or uncertainty', async () => {
    const store = readyStore()
    let started!: (config: InternalAxiosRequestConfig) => void
    const requestStarted = new Promise<InternalAxiosRequestConfig>(resolve => { started = resolve })
    let rejectRequest!: (error: Error) => void
    api.defaults.adapter = config => { started(config); return new Promise((_, reject) => { rejectRequest = reject }) }
    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
    const sending = store.set(sendApiChatTextAtom, { conversationId, text: 'legenda', file })
    const config = await requestStarted
    expect(config.url).toEndWith('/messages/media')
    expect(config.data).toBeInstanceOf(FormData)
    const form: FormData = config.data
    expect(form.get('file')).toEqual(file)
    expect(form.get('kind')).toBe('image')
    expect(form.get('caption')).toBe('legenda')
    const requestId = form.get('clientRequestId')
    expect(typeof requestId).toBe('string')
    expect(store.get(chatOptimisticMessagesAtom)).toHaveLength(1)
    const confirmed = mockMessage(500, conversationId, { clientRequestId: String(requestId), fromMe: true, type: 'image', text: 'legenda' })
    store.set(applyChatMessagesAtom, [confirmed])
    rejectRequest(new Error('timeout'))
    expect(await sending).toBe(true)
    expect(store.get(chatLiveCacheAtom).messages).toEqual([confirmed])
    expect(store.get(chatOptimisticMessagesAtom)).toEqual([])
  })

  test('a timeout without socket confirmation leaves one uncertain message and does not retry', async () => {
    const store = readyStore()
    let requests = 0
    api.defaults.adapter = async () => { requests++; throw new Error('timeout') }
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: '', file: new File(['x'], 'file.pdf', { type: 'application/pdf' }) })).toBe(false)
    expect(requests).toBe(1)
    expect(store.get(chatLiveCacheAtom).messages).toEqual([])
    expect(store.get(chatOptimisticMessagesAtom)).toHaveLength(1)
    expect(store.get(chatOptimisticMessagesAtom)[0].localStatus).toBe('uncertain')
  })

  test('rejects a file above the configured 1 MiB and captions above 4096 without a request', async () => {
    const store = readyStore()
    let requests = 0
    api.defaults.adapter = async () => { requests++; throw new Error('unexpected request') }
    const tooLarge = new File([new Uint8Array(1024 * 1024 + 1)], 'large.bin')
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: '', file: tooLarge })).toBe(false)
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'a'.repeat(4097), file: new File(['x'], 'x') })).toBe(false)
    expect(requests).toBe(0)
    expect(store.get(chatOptimisticMessagesAtom)).toEqual([])
  })

  test('accepts a 1 MiB file and a 4096-character caption', async () => {
    const store = readyStore()
    let requests = 0
    api.defaults.adapter = async config => {
      requests++
      const form: FormData = config.data
      const message = mockMessage(501, conversationId, { clientRequestId: String(form.get('clientRequestId')), fromMe: true })
      return { data: { status: 'success', data: message }, status: 200, statusText: 'OK', headers: {}, config }
    }
    const file = new File([new Uint8Array(1024 * 1024)], 'boundary.bin')
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'a'.repeat(4096), file })).toBe(true)
    expect(requests).toBe(1)
    expect(store.get(chatOptimisticMessagesAtom)).toEqual([])
    expect(store.get(chatLiveCacheAtom).messages).toHaveLength(1)
  })
})
