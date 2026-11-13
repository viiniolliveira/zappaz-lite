import { QueryClient } from '@tanstack/react-query'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import { createStore, Provider, useAtomValue } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { chatSubscribedAtom, chatSubscribedSessionIdAtom } from '../../src/atoms/chat-cache.ts'
import {
  chatContactFormAtom,
  chatContactPanelAtom,
  chatDeleteConversationIdsAtom,
  chatSessionIdAtom,
  selectedChatIdAtom,
} from '../../src/atoms/ui.ts'
import ContactFormDialog from '../../src/components/chat/contact-form-dialog.tsx'
import ConversationPanel from '../../src/components/chat/conversation-panel.tsx'
import DeleteConversationDialog from '../../src/components/chat/delete-conversation-dialog.tsx'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
store.set(chatSubscribedAtom, true)
store.set(chatSubscribedSessionIdAtom, mockSessionId)
const firstContact = mockConversations[0].contact
const secondContact = mockConversations[1].contact
if (!firstContact || !secondContact) throw Error('Missing contact fixtures')
const first = {
  ...mockConversations[0],
  contact: {
    ...firstContact,
    isSaved: true,
    localName: 'Marina Costa',
    email: 'marina@example.com',
    annotations: 'Nota privada',
  },
}
const second = {
  ...mockConversations[1],
  contact: { ...secondContact, isSaved: false, localName: null },
}
const image = first.messages.find((message) => message.type === 'image')
if (!image?.media?.thumbnail) throw Error('Missing image fixture')
const imageThumbnail = image.media.thumbnail
const imageBytes = Uint8Array.from(atob(imageThumbnail.base64), (character) =>
  character.charCodeAt(0),
)
const requests: { method: string; url: string; params: unknown; body: unknown }[] = []
let resolveMedia: ((data: unknown) => void) | undefined
let rejectMedia: (() => void) | undefined
function resolvePendingMedia(data: unknown) {
  if (!resolveMedia) throw Error('Missing pending media request')
  resolveMedia(data)
}
function rejectPendingMedia() {
  if (!rejectMedia) throw Error('Missing pending media request')
  rejectMedia()
}
let failSave = false
let failMessage = false
let loadOlder = 0
let conversationHeaderHeight = 0
let conversationHeaderBottom = 0
let informationHeaderHeight = 0
api.defaults.adapter = ((config) => {
  const method = config.method ?? ''
  const url = config.url ?? ''
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  requests.push({ method, url, params: config.params, body })
  const reply = (data: unknown): AxiosResponse => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data,
  })
  if (
    method === 'get' &&
    url.endsWith('/library') &&
    (config.params as { kind?: string }).kind === 'all'
  )
    return Promise.resolve(
      reply({ status: 'success', data: [], count: 1, page: { hasMore: false, nextCursor: null } }),
    )
  if (method === 'get' && (url.endsWith('/media') || url.endsWith('/library')))
    return new Promise((resolve, reject) => {
      resolveMedia = (data) => {
        if (url.endsWith('/library')) {
          const page = data as {
            status: string
            data: { message: typeof image }[]
            count: number
            page: unknown
          }
          resolve(
            reply({
              ...page,
              data: page.data.map(({ message }) => ({
                message,
                conversation: {
                  id: message.conversationId,
                  sessionId: message.sessionId,
                  displayName: first.displayName,
                  avatarUrl: null,
                },
              })),
            }),
          )
        } else resolve(reply(data))
      }
      rejectMedia = () => reject(new Error('Falha de mídia'))
    })
  if (method === 'get' && url.endsWith(`/messages/${image.id}`))
    return failMessage
      ? Promise.reject(new Error('Falha de mensagem'))
      : Promise.resolve(reply({ status: 'success', data: image }))
  if (method === 'get' && url.endsWith('/content'))
    return Promise.resolve(reply(new Blob([imageBytes], { type: imageThumbnail.mimeType })))
  if (method === 'patch' || method === 'put') {
    if (failSave) return Promise.reject(new Error('Falha ao salvar'))
    return Promise.resolve(
      reply({
        status: 'success',
        data: {
          ...first.contact,
          ...body,
          localName: body.name,
          displayName: body.name,
          isSaved: true,
          revision: 2,
        },
      }),
    )
  }
  return Promise.reject(new Error(`Unexpected request: ${method} ${url}`))
}) satisfies AxiosAdapter
store.set(selectedChatIdAtom, first.id)
const container = document.getElementById('root')
if (!container) throw Error('Missing root')
const root = createRoot(container)
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, run: () => Promise<void>) {
  try {
    await run()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw Error(`Missing ${selector}`)
  return found
}
function button(text: string, scope = 'aside') {
  const found = [...document.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(
    (item) => item.textContent?.trim() === text,
  )
  if (!found) throw Error(`Missing button ${text}`)
  return found
}
async function click(item: HTMLElement) {
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
async function input(selector: string, value: string) {
  await act(async () => {
    const field = element<HTMLInputElement | HTMLTextAreaElement>(selector)
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (!setter) throw Error('Input value setter missing')
    setter.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function View({ conversation }: { conversation: typeof first | typeof second }) {
  const deleting = useAtomValue(chatDeleteConversationIdsAtom)[0]
  return (
    <div style={{ display: 'flex', height: '800px', width: '100%' }}>
      <ConversationPanel
        conversation={conversation}
        hasOlder
        onLoadOlder={async () => {
          loadOlder++
        }}
        onBack={() => {}}
        onSend={async () => true}
      />
      <DeleteConversationDialog
        conversations={deleting === conversation.id ? [conversation] : []}
      />
      <ContactFormDialog />
    </div>
  )
}
async function render(conversation: typeof first | typeof second) {
  await act(async () =>
    root.render(createElement(Provider, { store }, createElement(View, { conversation }))),
  )
}
async function open(name: string) {
  await click(element(`button[aria-label="Informações de ${name}"]`))
}
await render(first)
await check(
  'header opens saved information and preserves history and responsive visibility',
  async () => {
    const history = element<HTMLElement>(`[aria-label="Histórico de ${first.displayName}"]`)
    const trigger = element<HTMLButtonElement>(
      `button[aria-label="Informações de ${first.displayName}"]`,
    )
    const conversationHeader = trigger.closest('header')?.getBoundingClientRect()
    if (!conversationHeader) throw Error('Conversation header missing')
    conversationHeaderHeight = conversationHeader.height
    conversationHeaderBottom = conversationHeader.bottom
    if (trigger.getAttribute('aria-expanded') !== 'false') throw Error('Incorrect collapsed state')
    await open(first.displayName)
    const target = store.get(chatContactPanelAtom)
    if (
      target?.sessionId !== first.sessionId ||
      target.conversationId !== first.id ||
      target.mediaMessageId !== null
    )
      throw Error('Wrong panel target')
    if (
      trigger.getAttribute('aria-expanded') !== 'true' ||
      document.querySelector(`[aria-label="Histórico de ${first.displayName}"]`) !== history
    )
      throw Error('Opening replaced history or failed to expand')
    const panel = element<HTMLElement>('aside[aria-label="Informações do contato"]')
    const panelHeader = panel.querySelector('header')?.getBoundingClientRect()
    if (!panelHeader || Math.abs(panelHeader.height - conversationHeaderHeight) > 1)
      throw Error('Information and conversation header heights differ')
    informationHeaderHeight = panelHeader.height
    if (window.innerWidth >= 1280 && Math.abs(panelHeader.bottom - conversationHeaderBottom) > 1)
      throw Error('Desktop header bottoms are not aligned')
    if (
      !panel.textContent?.includes('marina@example.com') ||
      !panel.textContent.includes('Nota privada')
    )
      throw Error('Saved details missing')
    const historyVisible = history.getBoundingClientRect().width > 0
    if (historyVisible !== window.innerWidth >= 1280)
      throw Error(`Wrong responsive history visibility at ${window.innerWidth}`)
    if (panel.getBoundingClientRect().width <= 0) throw Error('Panel is not visible')
  },
)
await check(
  'preview loads with scoped gallery parameters and opens fetched message in gallery',
  async () => {
    await flush()
    if (!element('aside').textContent?.includes('Carregando mídias…') || !resolveMedia)
      throw Error('Missing loading state')
    const panel = element<HTMLElement>('aside[aria-label="Informações do contato"]')
    const status = [...panel.querySelectorAll('[role="status"]')].find((item) =>
      item.textContent?.includes('Carregando mídias'),
    )
    if (!status?.querySelector('.sr-only')) throw Error('Missing accessible loading status')
    const placeholders = panel.querySelectorAll('[data-slot="skeleton"]')
    if (
      placeholders.length !== 4 ||
      [...placeholders].some((item) => !item.classList.contains('motion-reduce:animate-none'))
    )
      throw Error('Expected four reduced-motion media skeletons')
    const request = requests.find((item) => item.url.endsWith('/library'))
    if (
      !request?.url.endsWith(`/${first.sessionId}/library`) ||
      JSON.stringify(request.params) !==
        JSON.stringify({ conversationId: first.id, kind: 'media', limit: 4 })
    )
      throw Error(`Wrong media request ${JSON.stringify(request)}`)
    await act(async () => {
      resolvePendingMedia({
        status: 'success',
        data: [{ ...image.media, message: image }],
        count: 1,
        page: { hasMore: false, nextCursor: null },
      })
      await Promise.resolve()
    })
    await flush()
    if (panel.querySelector('[data-slot="skeleton"]')) throw Error('Skeletons remain after loading')
    await click(element('button[aria-label^="Abrir imagem:"]'))
    await flush()
    if (!requests.some((item) => item.url.endsWith(`/messages/${image.id}`)))
      throw Error('Selected message was not fetched')
    element('[role="dialog"] button[aria-label="Fechar galeria"]')
    const galleryRequest = requests.find(
      (item) => item.url.endsWith('/media') && (item.params as { limit?: number }).limit === 24,
    )
    if (!galleryRequest || loadOlder !== 0)
      throw Error('Gallery must request its own media without loading history')
    const footer = element<HTMLElement>('[data-slot="media-gallery"] footer')
    const galleryStatus = [...footer.querySelectorAll('[role="status"]')].find((item) =>
      item.textContent?.includes('Carregando miniaturas'),
    )
    if (!galleryStatus?.querySelector('.sr-only')) throw Error('Missing gallery loading status')
    const gallerySkeletons = footer.querySelectorAll('[data-slot="skeleton"]')
    if (
      gallerySkeletons.length !== 4 ||
      [...gallerySkeletons].some((item) => !item.classList.contains('motion-reduce:animate-none'))
    )
      throw Error('Expected four reduced-motion gallery skeletons')
    if (!footer.querySelector('[aria-current="true"]'))
      throw Error('Selected thumbnail missing during loading')
    await act(async () => {
      resolvePendingMedia({
        status: 'success',
        data: [{ ...image.media, message: image }],
        count: 1,
        page: { hasMore: false, nextCursor: null },
      })
      await Promise.resolve()
    })
    await flush()
    if (footer.querySelector('[data-slot="skeleton"]'))
      throw Error('Gallery skeletons remain after loading')
    await click(element('[role="dialog"] button[aria-label="Fechar galeria"]'))
    if (store.get(chatContactPanelAtom)?.mediaMessageId !== null)
      throw Error('Gallery selection was not cleared')
  },
)
await check(
  'saved edit stays in panel, back restores info and failed save keeps values',
  async () => {
    await click(element('button[aria-label="Editar contato"]'))
    const editHeader = element<HTMLElement>(
      'aside[aria-label="Informações do contato"] header',
    ).getBoundingClientRect()
    if (
      Math.abs(editHeader.height - informationHeaderHeight) > 1 ||
      Math.abs(editHeader.height - conversationHeaderHeight) > 1
    )
      throw Error('Edit header height changed')
    if (window.innerWidth >= 1280 && Math.abs(editHeader.bottom - conversationHeaderBottom) > 1)
      throw Error('Edit header bottom is not aligned')
    if (document.querySelector('[role="dialog"]')) throw Error('Edit unexpectedly opened a dialog')
    if (store.get(chatContactFormAtom)?.surface !== 'panel') throw Error('Wrong form surface')
    const phone = element<HTMLInputElement>('[name="phoneNumber"]')
    if (!phone.disabled && !phone.readOnly) throw Error('Existing phone is editable')
    if (
      element<HTMLInputElement>('[name="email"]').value !== 'marina@example.com' ||
      element<HTMLTextAreaElement>('[name="annotations"]').value !== 'Nota privada'
    )
      throw Error('Existing fields missing')
    await click(element('button[aria-label="Voltar para informações do contato"]'))
    if (store.get(chatContactFormAtom) !== null) throw Error('Back did not exit edit')
    await click(element('button[aria-label="Editar contato"]'))
    await input('[name="name"]', 'Marina editada')
    failSave = true
    await click(button('Salvar contato'))
    await flush()
    if (
      !store.get(chatContactFormAtom) ||
      element<HTMLInputElement>('[name="name"]').value !== 'Marina editada'
    )
      throw Error('Failed save discarded edit')
    failSave = false
    await click(button('Salvar contato'))
    await flush()
    if (
      store.get(chatContactFormAtom) !== null ||
      !document.querySelector('button[aria-label="Editar contato"]')
    )
      throw Error('Successful save did not return to information')
    const patch = requests.filter((item) => item.method === 'patch').at(-1)
    if ((patch?.body as { name?: string })?.name !== 'Marina editada')
      throw Error('Wrong edit payload')
  },
)
await check(
  'delete requires existing confirmation and cancel preserves contact and conversation',
  async () => {
    const before = requests.filter((request) => request.method === 'delete').length
    await click(button('Excluir conversa'))
    const dialog = element<HTMLElement>('[role="dialog"]')
    if (
      !dialog.textContent?.includes('O contato será mantido') ||
      !dialog.textContent.includes(first.displayName)
    )
      throw Error('Missing deletion explanation')
    if (requests.filter((request) => request.method === 'delete').length !== before)
      throw Error('Deletion occurred before confirmation')
    await click(button('Cancelar', '[role="dialog"]'))
    if (
      store.get(chatDeleteConversationIdsAtom).length ||
      requests.filter((request) => request.method === 'delete').length !== before
    )
      throw Error('Cancel sent deletion')
  },
)
await check('closing and opening another unsaved conversation does not leak data', async () => {
  await click(element('button[aria-label="Fechar informações do contato"]'))
  if (store.get(chatContactPanelAtom) !== null) throw Error('Panel did not close')
  await act(async () => store.set(selectedChatIdAtom, second.id))
  await render(second)
  await open(second.displayName)
  const panel = element<HTMLElement>('aside[aria-label="Informações do contato"]')
  if (
    panel.textContent?.includes('marina@example.com') ||
    panel.textContent?.includes('Nota privada')
  )
    throw Error('Previous contact details leaked')
  await click(button('Salvar contato'))
  if (
    store.get(chatContactFormAtom)?.surface !== 'panel' ||
    store.get(chatContactFormAtom)?.saved !== false
  )
    throw Error('Unsaved contact did not open panel form')
  if (!element<HTMLInputElement>('[name="phoneNumber"]').disabled)
    throw Error('Unsaved existing identity is editable')
  await input('[name="name"]', 'Rafael salvo')
  await click(button('Salvar contato'))
  await flush()
  if (
    !requests.some((request) => request.method === 'put') ||
    store.get(chatContactFormAtom) !== null
  )
    throw Error('Unsaved contact was not saved')
})
await check('empty preview is shown for the new conversation', async () => {
  await flush()
  if (!resolveMedia) throw Error('Missing media request')
  await act(async () => {
    resolvePendingMedia({
      status: 'success',
      data: [],
      count: 0,
      page: { hasMore: false, nextCursor: null },
    })
    await Promise.resolve()
  })
  await flush()
  if (!element('aside').textContent?.includes('Nenhuma mídia compartilhada.'))
    throw Error('Empty state missing')
  if (element('aside').querySelector('[data-slot="skeleton"]'))
    throw Error('Skeletons remain in empty state')
  if (document.querySelector('button[aria-label^="Abrir imagem"]'))
    throw Error('Previous preview leaked')
})
await check(
  'preview errors can be retried, and selected-message errors can be dismissed',
  async () => {
    await click(element('button[aria-label="Fechar informações do contato"]'))
    const otherSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const other = {
      ...second,
      sessionId: otherSession,
      contact: { ...second.contact, sessionId: otherSession },
      messages: [],
    }
    await act(async () => {
      store.set(chatSessionIdAtom, otherSession)
      store.set(chatSubscribedSessionIdAtom, otherSession)
      store.set(selectedChatIdAtom, other.id)
    })
    await render(other)
    await open(other.displayName)
    await flush()
    if (
      !requests.some(
        (item) =>
          item.url.endsWith(`/${otherSession}/library`) &&
          (item.params as { conversationId?: string }).conversationId === other.id,
      )
    )
      throw Error('New session did not use its own media scope')
    if (element('aside').textContent?.includes('Nenhuma mídia compartilhada.'))
      throw Error('Previous session preview leaked')
    if (!rejectMedia) throw Error('Missing pending request')
    await act(async () => {
      rejectPendingMedia()
      await Promise.resolve()
    })
    await flush()
    if (!element('[role="alert"]').textContent?.includes('Não foi possível carregar as mídias'))
      throw Error('Media error missing')
    if (element('aside').querySelector('[data-slot="skeleton"]'))
      throw Error('Skeletons remain in error state')
    await click(button('Tentar novamente'))
    await flush()
    await act(async () => {
      resolvePendingMedia({
        status: 'success',
        data: [{ ...image.media, message: image }],
        count: 1,
        page: { hasMore: false, nextCursor: null },
      })
      await Promise.resolve()
    })
    await flush()
    failMessage = true
    await click(element('button[aria-label^="Abrir imagem:"]'))
    await flush()
    if (!element('[role="alert"]').textContent?.includes('Não foi possível abrir esta mídia'))
      throw Error('Selected message error missing')
    await click(button('Fechar prévia'))
    if (
      store.get(chatContactPanelAtom)?.mediaMessageId !== null ||
      document.querySelector('[role="dialog"][data-state="open"]')
    )
      throw Error('Failed selection was not dismissed')
  },
)
await check(
  'empty conversation placeholder is centered in the space beside the sidebar',
  async () => {
    if (window.innerWidth < 1280) return
    await act(async () =>
      root.render(
        createElement(
          Provider,
          { store },
          <div style={{ display: 'flex', height: '800px', width: '100%' }}>
            <aside style={{ width: '320px', flex: 'none' }} aria-label="Sidebar de teste" />
            <ConversationPanel
              conversation={undefined}
              onBack={() => {}}
              onSend={async () => true}
            />
          </div>,
        ),
      ),
    )
    const area = element<HTMLElement>('[aria-label="Conversa selecionada"]').getBoundingClientRect()
    const heading = [...document.querySelectorAll<HTMLElement>('h2')].find(
      (item) => item.textContent === 'Suas conversas, em um só lugar',
    )
    if (!heading) throw Error('Empty conversation heading missing')
    const rect = heading.getBoundingClientRect()
    if (
      area.width <= 0 ||
      Math.abs((rect.left + rect.right) / 2 - (area.left + area.right) / 2) > 1
    )
      throw Error('Empty state is not centered in the remaining conversation width')
  },
)
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
