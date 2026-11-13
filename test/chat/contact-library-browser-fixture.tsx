import { QueryClient } from '@tanstack/react-query'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  chatAccessDeniedAtom,
  chatSubscribedAtom,
  chatSubscribedSessionIdAtom,
} from '../../src/atoms/chat-cache.ts'
import { chatContactPanelAtom, chatSessionIdAtom, selectedChatIdAtom } from '../../src/atoms/ui.ts'
import ChatLibraryDialog from '../../src/components/chat/chat-library-dialog.tsx'
import ContactDetailsPanel from '../../src/components/chat/contact-details-panel.tsx'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const conversation = mockConversations[0]
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
store.set(selectedChatIdAtom, conversation.id)
store.set(chatSubscribedAtom, true)
store.set(chatSubscribedSessionIdAtom, mockSessionId)
store.set(chatContactPanelAtom, {
  sessionId: mockSessionId,
  conversationId: conversation.id,
  mediaMessageId: null,
})
const info = {
  id: conversation.id,
  sessionId: mockSessionId,
  displayName: conversation.displayName,
  avatarUrl: null,
}
function message(type: string) {
  const found = conversation.messages.find((item) => item.type === type)
  if (!found) throw Error(`Missing ${type}`)
  return found
}
const originalDoc = message('document')
if (!originalDoc.media) throw Error('Missing document media')
const filename = `${'documento-longo-'.repeat(10)}final.pdf`
const documentCaption = 'Legenda de documento longa. '.repeat(35)
const doc = {
  ...originalDoc,
  text: documentCaption,
  media: { ...originalDoc.media, fileName: filename },
}
const linkText =
  'Primeira linha https://example.com/arquivo\nSegunda linha com https://example.org/outro\nTerceira linha que deve ficar oculta visualmente.\nQuarta linha preservada no texto.'
const linkTitle = 'Título extenso da prévia para verificar o truncamento visual. '.repeat(6)
const link = mockMessage(800, conversation.id, {
  text: linkText,
  hasLink: true,
  linkPreview: {
    url: 'https://example.com/arquivo',
    title: linkTitle,
    description: null,
    thumbnail: null,
  },
})
const shortLink = mockMessage(801, conversation.id, { text: 'Legenda curta', hasLink: true })
const emptyLink = mockMessage(802, conversation.id, { text: null, hasLink: true })
const formattedLink = mockMessage(803, conversation.id, {
  text: '*Destaque* e ```código```\nhttps://example.net/formatado\nMais texto abaixo.',
  hasLink: true,
})
const image = message('image')
const imageMedia = image.media
if (!imageMedia) throw Error('Missing image media')
const visualMessages = [
  image,
  ...Array.from({ length: 5 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(900 + index).padStart(12, '0')}`
    const mediaId = `00000000-0000-4000-8000-${String(950 + index).padStart(12, '0')}`
    return {
      ...image,
      id,
      messageId: `IMAGE-${index}`,
      orderAt: index < 3 ? '2026-10-25T12:00:00.000Z' : '2026-09-25T12:00:00.000Z',
      media: {
        ...imageMedia,
        id: mediaId,
        messageRecordId: id,
        contentPath: imageMedia.contentPath.replace(imageMedia.id, mediaId),
      },
    }
  }),
]
const otherConversation = mockConversations[1]
const otherImageId = '00000000-0000-4000-8000-000000000980'
const otherImage = {
  ...image,
  id: otherImageId,
  messageId: 'OTHER-CONVERSATION-IMAGE',
  text: 'Imagem exclusiva da segunda conversa',
  conversationId: otherConversation.id,
  media: {
    ...imageMedia,
    id: '00000000-0000-4000-8000-000000000981',
    messageRecordId: otherImageId,
    conversationId: otherConversation.id,
    contentPath: imageMedia.contentPath
      .replace(conversation.id, otherConversation.id)
      .replace(imageMedia.id, '00000000-0000-4000-8000-000000000981'),
  },
}
const otherInfo = {
  id: otherConversation.id,
  sessionId: mockSessionId,
  displayName: otherConversation.displayName,
  avatarUrl: null,
}
const extraMessages = Array.from({ length: 18 }, (_, index) => {
  const id = `00000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`
  return {
    ...image,
    id,
    messageId: `EXTRA-${index}`,
    media: {
      ...imageMedia,
      id: `00000000-0000-4000-8000-${String(1100 + index).padStart(12, '0')}`,
      messageRecordId: id,
      contentPath: imageMedia.contentPath.replace(
        imageMedia.id,
        `00000000-0000-4000-8000-${String(1100 + index).padStart(12, '0')}`,
      ),
    },
  }
})
const requests: {
  url: string
  params: { kind?: string; cursor?: string; limit?: number; conversationId?: string }
}[] = []
Object.assign(globalThis, { libraryTestRequests: requests })
let failLinks = false
let infiniteScenario = ''
let failedNextPage = false
let releasePending: (() => void) | undefined
let failSidebarNextPage = false
let emptyDocuments = false
let playCalls = 0
const audioBytes = new ArrayBuffer(44 + 16000)
const audioView = new DataView(audioBytes)
for (const [offset, text] of [
  [0, 'RIFF'],
  [8, 'WAVE'],
  [12, 'fmt '],
  [36, 'data'],
] as const)
  for (let index = 0; index < text.length; index++)
    audioView.setUint8(offset + index, text.charCodeAt(index))
audioView.setUint32(4, audioBytes.byteLength - 8, true)
audioView.setUint32(16, 16, true)
audioView.setUint16(20, 1, true)
audioView.setUint16(22, 1, true)
audioView.setUint32(24, 8000, true)
audioView.setUint32(28, 16000, true)
audioView.setUint16(32, 2, true)
audioView.setUint16(34, 16, true)
audioView.setUint32(40, 16000, true)
for (let index = 0; index < 8000; index++)
  audioView.setInt16(44 + index * 2, Math.round(Math.sin(index * 0.25) * 4000), true)
const audioBlob = new Blob([audioBytes], { type: 'audio/wav' })
const originalPlay = HTMLMediaElement.prototype.play
HTMLMediaElement.prototype.play = function () {
  playCalls++
  return originalPlay.call(this)
}
api.defaults.adapter = ((config) => {
  const params = (config.params ?? {}) as {
    kind?: string
    cursor?: string
    limit?: number
    conversationId?: string
  }
  const url = config.url ?? ''
  requests.push({ url, params })
  function reply(data: unknown): AxiosResponse {
    return { config, status: 200, statusText: 'OK', headers: {}, data }
  }
  if (url.endsWith('/library')) {
    if (infiniteScenario && !params.conversationId) {
      const entry = (item: typeof image) => ({ message: item, conversation: info })
      const response = (items: (typeof image)[], nextCursor: string | null) =>
        reply({
          status: 'success',
          data: items.map(entry),
          count: items.length,
          page: { hasMore: nextCursor !== null, nextCursor },
        })
      if (params.kind === 'media') {
        if (infiniteScenario === 'underfilled') {
          const index = params.cursor === 'short-1' ? 1 : params.cursor === 'short-2' ? 2 : 0
          return Promise.resolve(
            response([visualMessages[index]], index < 2 ? `short-${index + 1}` : null),
          )
        }
        if (params.cursor === 'next-page') {
          if (infiniteScenario === 'error' && !failedNextPage) {
            failedNextPage = true
            return Promise.reject(Error('Next page failed'))
          }
          if (infiniteScenario === 'pending')
            return new Promise((resolve) => {
              releasePending = () => resolve(response([message('video')], null))
            })
          return Promise.resolve(response([message('video')], null))
        }
        return Promise.resolve(response([...visualMessages, ...extraMessages], 'next-page'))
      }
      if (params.kind === 'document')
        return Promise.resolve(response([doc], params.cursor ? null : 'document-next'))
    }
    if (params.kind === 'media' && params.conversationId && params.cursor && failSidebarNextPage) {
      failSidebarNextPage = false
      return Promise.reject(Error('Sidebar next page failed'))
    }
    if (params.kind === 'link' && failLinks) return Promise.reject(Error('Network error'))
    const mediaItems = params.conversationId
      ? [...visualMessages, message('audio'), ...extraMessages, message('video')]
      : [
          visualMessages[0],
          visualMessages[1],
          otherImage,
          ...visualMessages.slice(2),
          ...extraMessages,
          message('video'),
        ]
    const messages =
      params.kind === 'document'
        ? emptyDocuments
          ? []
          : [doc]
        : params.kind === 'link'
          ? [link, shortLink, emptyLink, formattedLink]
          : params.limit === 4
            ? [...visualMessages.slice(0, 3), message('audio')]
            : params.cursor
              ? mediaItems.slice(24)
              : mediaItems.slice(0, 24)
    return Promise.resolve(
      reply({
        status: 'success',
        data: messages.map((item) => ({
          message: item,
          conversation: item.id === otherImage.id ? otherInfo : info,
        })),
        count:
          params.kind === 'all' ? 9 : params.kind === 'media' ? mediaItems.length : messages.length,
        page: {
          hasMore: params.kind === 'media' && params.limit === 24 && !params.cursor,
          nextCursor:
            params.kind === 'media' && params.limit === 24 && !params.cursor ? 'next-page' : null,
        },
      }),
    )
  }
  if (url.endsWith(`/messages/${message('audio').id}`))
    return Promise.resolve(reply({ status: 'success', data: message('audio') }))
  if (url.endsWith(`/messages/${doc.id}`))
    return Promise.resolve(reply({ status: 'success', data: doc }))
  if (url.endsWith(`/messages/${message('image').id}`))
    return Promise.resolve(reply({ status: 'success', data: message('image') }))
  if (url.endsWith('/media')) {
    const galleryMessages = url.includes(`/conversations/${otherConversation.id}/`)
      ? [otherImage]
      : [image, message('video'), message('audio')]
    return Promise.resolve(
      reply({
        status: 'success',
        data: galleryMessages.map((item) => ({ ...item.media, message: item })),
        count: galleryMessages.length,
        page: { hasMore: false, nextCursor: null },
      }),
    )
  }
  if (url.endsWith(`/media/${message('audio').media?.id}/content`))
    return Promise.resolve(reply(audioBlob))
  if (url.endsWith('/content')) {
    const thumbnail = imageMedia.thumbnail
    if (!thumbnail) throw Error('Missing image thumbnail')
    const bytes = Uint8Array.from(atob(thumbnail.base64), (char) => char.charCodeAt(0))
    return Promise.resolve(reply(new Blob([bytes], { type: thumbnail.mimeType })))
  }
  return Promise.reject(Error(`Unexpected request ${url}`))
}) satisfies AxiosAdapter
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
function find(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector)
  if (!node) throw Error(`Missing ${selector}`)
  return node
}
function textButton(text: string, scope: ParentNode = document): HTMLButtonElement {
  const node = [...scope.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  )
  if (!node) throw Error(`Missing button ${text}`)
  return node
}
async function click(node: HTMLElement) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    node.click()
    await Promise.resolve()
  })
}
async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (condition()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  throw Error(
    `Timed out: dialogs=${document.querySelectorAll('[role=dialog]').length} gallery=${!!document.querySelector('[data-slot=media-gallery]')} doc=${!!document.querySelector('[role=dialog] button[aria-label^="Abrir documento "]')} text=${[...document.querySelectorAll('[role=dialog]')].map((d) => d.textContent?.slice(0, 100)).join('|')}`,
  )
}
function dialog() {
  return find('[role="dialog"]')
}
function verifyLinkCaptions(scope: HTMLElement) {
  const anchor = scope.querySelector<HTMLAnchorElement>('a[href="https://example.com/arquivo"]')
  const row = anchor?.closest('li')
  const title = row?.querySelector<HTMLElement>('p[title]')
  if (!title || title.textContent !== linkTitle || title.title !== linkTitle)
    throw Error('Link preview title changed or full title is unavailable')
  const titleStyle = getComputedStyle(title)
  const titleLineHeight = Number.parseFloat(titleStyle.lineHeight)
  if (!Number.isFinite(titleLineHeight)) throw Error('Link title line height unavailable')
  if (scope.matches('[role="dialog"]')) {
    if (
      titleStyle.whiteSpace !== 'nowrap' ||
      titleStyle.textOverflow !== 'ellipsis' ||
      title.scrollWidth <= title.clientWidth ||
      title.clientHeight > titleLineHeight + 1
    )
      throw Error('Session link title is not truncated to one line')
  } else if (
    titleStyle.webkitLineClamp !== '2' ||
    title.clientHeight > titleLineHeight * 2 + 1 ||
    title.clientHeight < titleLineHeight * 2 - 1 ||
    title.scrollHeight <= title.clientHeight
  ) {
    throw Error('Sidebar link title is not clamped to two lines')
  }
  const caption = row?.children.item(1)
  if (!(caption instanceof HTMLElement)) throw Error('Long link caption missing')
  const style = getComputedStyle(caption)
  const lineHeight = Number.parseFloat(style.lineHeight)
  if (
    !Number.isFinite(lineHeight) ||
    caption.clientHeight > lineHeight * 2 + 1 ||
    caption.clientHeight < lineHeight * 2 - 1
  )
    throw Error(
      `Caption is not two lines: ${caption.clientHeight}, line height ${style.lineHeight}`,
    )
  if (caption.scrollHeight <= caption.clientHeight) throw Error('Long caption was not clipped')
  if (style.whiteSpace !== 'pre-wrap' || caption.textContent !== linkText)
    throw Error('Original caption text or line breaks were not preserved')
  if (caption.querySelector('a, button, [tabindex]'))
    throw Error('Clipped caption contains focusable elements')
  for (const href of ['https://example.com/arquivo', 'https://example.org/outro']) {
    const linkElement = row?.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
    if (
      linkElement?.target !== '_blank' ||
      !linkElement.rel.includes('noopener') ||
      !linkElement.rel.includes('noreferrer')
    )
      throw Error(`Missing safe clickable link ${href}`)
  }
  const captions = [...scope.querySelectorAll('li')]
    .map((item) => item.children.item(1))
    .filter((item): item is HTMLElement => item instanceof HTMLElement)
  const short = captions.find((item) => item.textContent === 'Legenda curta')
  const empty = captions.find((item) => item.textContent === 'Sem legenda')
  if (
    !short ||
    short.scrollHeight > short.clientHeight ||
    short.clientHeight > Number.parseFloat(getComputedStyle(short).lineHeight) + 1
  )
    throw Error('Short caption is not a single unclipped line')
  if (!empty) throw Error('Empty caption fallback missing')
  const formattedAnchor = scope.querySelector('a[href="https://example.net/formatado"]')
  const formattedCaption = formattedAnchor?.closest('li')?.children.item(1)
  if (
    !(formattedCaption instanceof HTMLElement) ||
    !formattedCaption.querySelector('strong') ||
    !formattedCaption.querySelector('code') ||
    formattedCaption.textContent !==
      'Destaque e código\nhttps://example.net/formatado\nMais texto abaixo.' ||
    formattedCaption.querySelector('a')
  )
    throw Error('Formatted caption changed or contains a duplicate link')
}
function verifyDocumentCaption(scope: HTMLElement) {
  const row = scope.querySelector('button[aria-label^="Abrir documento "]')?.closest('li')
  const caption = row?.children.item(1)
  if (!(caption instanceof HTMLElement)) throw Error('Document caption missing')
  const lineHeight = Number.parseFloat(getComputedStyle(caption).lineHeight)
  if (
    caption.textContent !== documentCaption ||
    caption.clientHeight <= lineHeight * 2 ||
    caption.scrollHeight > caption.clientHeight
  )
    throw Error('Document caption was clipped or changed')
}
await act(async () =>
  root.render(
    <Provider store={store}>
      <div style={{ display: 'flex', height: '760px', width: '100%' }}>
        <ContactDetailsPanel conversation={conversation} onClose={() => {}} />
      </div>
    </Provider>,
  ),
)
await check('summary displays union count and does not fetch audio or documents', async () => {
  await waitFor(() => !!document.querySelector('button[aria-label^="Abrir imagem:"]'))
  const section = find('section[aria-label="Mídia, links e documentos"]')
  if (!section.textContent?.includes('9')) throw Error('Union count missing')
  if (
    section.querySelectorAll(
      'button[aria-label^="Abrir imagem:"], button[aria-label^="Ouvir áudio:"]',
    ).length !== 4
  )
    throw Error('Expected four summary media tiles')
  if (section.querySelector('[role="tab"]')) throw Error('Summary unexpectedly contains tabs')
  if (
    !requests.some((r) => r.params.kind === 'media' && r.params.limit === 4) ||
    !requests.some((r) => r.params.kind === 'all' && r.params.limit === 1)
  )
    throw Error('Wrong summary queries')
  if (requests.some((r) => r.url.endsWith('/content')))
    throw Error('Summary downloaded media before activation')
})
await check('sidebar pagination, audio and back navigation', async () => {
  failSidebarNextPage = true
  await click(find('section[aria-label="Mídia, links e documentos"] > button'))
  await waitFor(
    () =>
      !!document.querySelector(
        'aside[aria-label="Biblioteca da conversa"] button[aria-label^="Abrir imagem:"]',
      ),
  )
  const area = find('aside[aria-label="Biblioteca da conversa"]')
  if (area.querySelectorAll('section[aria-label] .grid-cols-3').length < 2)
    throw Error('Expected multiple monthly groups')
  if (!area.querySelector('.grid-cols-3')) throw Error('Three column grid missing')
  if (requests.some((r) => r.url.endsWith('/content')))
    throw Error('Sidebar downloaded media before activation')
  if (!area.querySelector('button[aria-label^="Ouvir áudio:"]'))
    throw Error('Sidebar audio missing')
  if (
    [...area.querySelectorAll('button')].some((button) =>
      button.textContent?.includes('Carregar mais'),
    )
  )
    throw Error('Sidebar still has a load-more button')
  const panel = area.querySelector<HTMLElement>('[role="tabpanel"]')
  if (!panel || panel.scrollHeight <= panel.clientHeight) throw Error('Sidebar does not scroll')
  const sidebarPages = () =>
    requests.filter(
      (r) =>
        r.url.endsWith('/library') &&
        r.params.conversationId === conversation.id &&
        r.params.kind === 'media' &&
        r.params.cursor === 'next-page',
    ).length
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (sidebarPages()) throw Error('Sidebar fetched next page away from bottom')
  await act(async () => {
    panel.scrollTop = panel.scrollHeight
    panel.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await waitFor(() => !!area.querySelector('[role="alert"]'))
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (sidebarPages() !== 1) throw Error('Sidebar retried failed page automatically')
  await click(textButton('Tentar novamente', area))
  await waitFor(() => !!area.querySelector('button[aria-label^="Abrir vídeo:"]'))
  await act(async () => {
    panel.scrollTop = panel.scrollHeight
    panel.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (sidebarPages() !== 2) throw Error('Sidebar retry duplicated or fetched beyond EOF')
  const audio = message('audio')
  const audioContent = `/media/${audio.media?.id}/content`
  if (requests.some((r) => r.url.endsWith(audioContent)))
    throw Error('Audio downloaded before click')
  await click(find('button[aria-label^="Ouvir áudio:"]'))
  await waitFor(
    () => !!document.querySelector('[data-slot="media-gallery"] [data-slot="message-audio"]'),
  )
  await waitFor(() => requests.filter((r) => r.url.endsWith(audioContent)).length > 0)
  await waitFor(
    () =>
      !!document.querySelector('[data-slot="media-gallery"] button[aria-label="Reproduzir áudio"]'),
  )
  if (requests.filter((r) => r.url.endsWith(audioContent)).length !== 1)
    throw Error('Audio was downloaded more than once')
  if (playCalls !== 0) throw Error('Audio should not start automatically')
  await waitFor(
    () =>
      !!document.querySelector(
        '[data-slot="media-gallery"] [aria-current="true"][aria-label^="Abrir áudio "]',
      ),
  )
  await click(find('[data-slot="media-gallery"] button[aria-label^="Abrir vídeo "]'))
  await waitFor(
    () =>
      !!document.querySelector(
        '[data-slot="media-gallery"] [aria-current="true"][aria-label^="Abrir vídeo "]',
      ),
  )
  if (document.querySelector('[data-slot="media-gallery"] [data-slot="message-audio"]'))
    throw Error('Audio player remained mounted after navigation')
  if (requests.filter((r) => r.url.endsWith(audioContent)).length !== 1)
    throw Error('Audio was downloaded more than once')
  await click(find('[data-slot="media-gallery"] button[aria-label="Fechar galeria"]'))
  await waitFor(() => !document.querySelector('[data-slot="media-gallery"]'))
  await click(find('button[aria-label="Voltar para informações do contato"]'))
  if (!document.querySelector('aside[aria-label="Informações do contato"]'))
    throw Error('Back did not restore info')
  const beforeSummary = requests.length
  await click(
    find('section[aria-label="Mídia, links e documentos"] button[aria-label^="Ouvir áudio:"]'),
  )
  await waitFor(
    () => !!document.querySelector('[data-slot="media-gallery"] [data-slot="message-audio"]'),
  )
  if (
    !requests.slice(beforeSummary).some((request) => request.url.endsWith(`/messages/${audio.id}`))
  )
    throw Error('Summary audio did not fetch its selected message')
  if (playCalls !== 0) throw Error('Summary audio started automatically')
  await click(find('[data-slot="media-gallery"] button[aria-label="Fechar galeria"]'))
  await waitFor(() => !document.querySelector('[data-slot="media-gallery"]'))
  await click(find('section[aria-label="Mídia, links e documentos"] > button'))
})
await check('document explicit action and modal tabs remain scoped', async () => {
  await click(textButton('Links', find('aside')))
  await waitFor(() => !!document.querySelector('aside a[href="https://example.com/arquivo"]'))
  verifyLinkCaptions(find('aside[aria-label="Biblioteca da conversa"]'))
  failLinks = true
  await click(textButton('Documentos', find('aside')))
  await waitFor(() => !!document.querySelector('button[aria-label^="Abrir documento "]'))
  verifyDocumentCaption(find('aside[aria-label="Biblioteca da conversa"]'))
  if (requests.some((r) => r.url.includes(`/media/${doc.media.id}/content`)))
    throw Error('PDF downloaded before click')
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth)
    throw Error('Long filename overflow')
  await click(textButton('Ver mídias de todas as conversas'))
  await waitFor(
    () => !!document.querySelector('[role="dialog"] button[aria-label^="Abrir documento "]'),
  )
  verifyDocumentCaption(dialog())
  const modalBounds = dialog().getBoundingClientRect()
  if (modalBounds.left < 0 || modalBounds.right > window.innerWidth)
    throw Error(
      `Modal exceeds viewport: ${modalBounds.left}..${modalBounds.right} / ${window.innerWidth}`,
    )
  if (
    !requests.some(
      (r) => r.params.kind === 'document' && r.params.limit === 24 && !r.params.conversationId,
    )
  )
    throw Error('Session scope missing')
  await click(find('[role="dialog"] button[aria-label^="Abrir documento "]'))
  await waitFor(() => !!document.querySelector('button[aria-label="Fechar PDF"]'))
  await click(find('button[aria-label="Fechar PDF"]'))
  await waitFor(
    () => !!document.querySelector('[role="dialog"] button[aria-label^="Abrir documento "]'),
  )
  if (textButton('Documentos', dialog()).getAttribute('aria-selected') !== 'true')
    throw Error('Modal tab not preserved')
})
await check('modal link error retry and safe URLs', async () => {
  await click(textButton('Links', dialog()))
  await waitFor(() => !!document.querySelector('[role="dialog"] [role="alert"]'))
  failLinks = false
  await click(textButton('Tentar novamente', dialog()))
  await waitFor(
    () => !!document.querySelector('[role="dialog"] a[href="https://example.com/arquivo"]'),
  )
  verifyLinkCaptions(dialog())
  if (
    !find('[role="dialog"] a[href="https://example.com/arquivo"]')
      .getAttribute('rel')
      ?.includes('noopener')
  )
    throw Error('Unsafe link')
  if (!dialog().textContent?.includes('Marina Costa')) throw Error('Sender missing')
})
await check('category empty state', async () => {
  emptyDocuments = true
  await click(textButton('Documentos', dialog()))
  await act(async () => {
    await client.refetchQueries({ type: 'active' })
  })
  await waitFor(() => !!dialog().textContent?.includes('Nenhum documento compartilhado.'))
})
await check('keyboard navigation selects adjacent tabs', async () => {
  const tab = textButton('Documentos', dialog())
  tab.focus()
  await act(async () => {
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()
  })
  await waitFor(() => textButton('Links', dialog()).getAttribute('aria-selected') === 'true')
})
await check(
  'session image opens other conversation gallery and restores tab, scroll and focus',
  async () => {
    await click(textButton('Mídia', dialog()))
    await waitFor(
      () => !!dialog().querySelector(`button[aria-label="Abrir imagem: ${otherImageId}"]`),
    )
    const modal = dialog()
    if (modal.querySelector('button[aria-label^="Ouvir áudio:"]'))
      throw Error('Session media library must not show audio')
    const trigger = modal.querySelector<HTMLButtonElement>(
      `button[aria-label="Abrir imagem: ${otherImageId}"]`,
    )
    if (!trigger) throw Error('Other conversation image missing')
    const scroll = trigger.closest<HTMLElement>('[role="tabpanel"]')
    if (!scroll || scroll.scrollHeight - scroll.clientHeight < 120)
      throw Error('Fixture does not overflow')
    scroll.scrollTop = 120
    trigger.focus({ preventScroll: true })
    if (scroll.scrollTop !== 120) throw Error('Unable to set scroll position')
    await waitFor(
      () => !!trigger.querySelector<HTMLImageElement>('img[src^="blob:"]')?.naturalWidth,
    )
    await waitFor(() => trigger.getAttribute('aria-busy') === 'false')
    const otherContent = `/media/${otherImage.media.id}/content`
    if (requests.filter((request) => request.url.endsWith(otherContent)).length !== 1)
      throw Error('Visible modal tile must download its media exactly once')
    const priorRequests = requests.length
    await click(trigger)
    await waitFor(() => !!document.querySelector('[data-slot="media-gallery"]'))
    await waitFor(() =>
      requests
        .slice(priorRequests)
        .some(
          (request) =>
            request.url.endsWith(
              `/session/${mockSessionId}/conversations/${otherConversation.id}/media`,
            ) && request.params.kind === 'gallery',
        ),
    )
    const gallery = find('[data-slot="media-gallery"]')
    if (!gallery.textContent?.includes(otherConversation.displayName))
      throw Error('Gallery conversation mismatch')
    if (!gallery.textContent?.includes('Imagem exclusiva da segunda conversa'))
      throw Error('Wrong initial image selected')
    if (!gallery.querySelector('[aria-current="true"]'))
      throw Error('Initial image is not selected')
    await waitFor(
      () => requests.filter((request) => request.url.endsWith(otherContent)).length === 1,
    )
    if (requests.filter((request) => request.url.endsWith(otherContent)).length !== 1)
      throw Error('Gallery should reuse the selected tile blob')
    await click(find('[data-slot="media-gallery"] button[aria-label="Fechar galeria"]'))
    await waitFor(() => !document.querySelector('[data-slot="media-gallery"]'))
    if (dialog() !== modal || textButton('Mídia', modal).getAttribute('aria-selected') !== 'true')
      throw Error('Modal or active tab was not preserved')
    if (scroll.scrollTop !== 120) throw Error(`Scroll position changed to ${scroll.scrollTop}`)
    await waitFor(() => document.activeElement === trigger)
    await click(textButton('Links', modal))
  },
)
const screenshot = new URLSearchParams(location.search).get('screenshot')
if (screenshot === 'infinite-scenarios') {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 350))
  const libraryRequests = () =>
    requests.filter((item) => item.url.endsWith('/library') && !item.params.conversationId)
  const cursors = (kind: string, cursor: string) =>
    libraryRequests().filter((item) => item.params.kind === kind && item.params.cursor === cursor)
      .length
  async function mountScenario(name: string, denied = false) {
    await act(async () => root.render(null))
    client.clear()
    requests.length = 0
    infiniteScenario = name
    failedNextPage = false
    releasePending = undefined
    const scenarioStore = createStore()
    scenarioStore.set(
      queryClientAtom,
      new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
    )
    scenarioStore.set(chatSessionIdAtom, mockSessionId)
    scenarioStore.set(chatSubscribedAtom, true)
    scenarioStore.set(chatSubscribedSessionIdAtom, mockSessionId)
    scenarioStore.set(chatAccessDeniedAtom, denied)
    await act(async () => {
      root.render(
        <Provider store={scenarioStore}>
          <ChatLibraryDialog sessionId={mockSessionId} initialKind="media" onClose={() => {}} />
        </Provider>,
      )
    })
    return scenarioStore
  }
  async function scrollToEnd() {
    const panel = find('[role="dialog"] [role="tabpanel"]')
    await act(async () => {
      panel.scrollTop = panel.scrollHeight
      panel.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
  }
  await check('next-page failure requires one explicit retry and stops at EOF', async () => {
    await mountScenario('error')
    await waitFor(() => !!dialog().querySelector('button[aria-label^="Abrir imagem:"]'))
    await scrollToEnd()
    await waitFor(() => !!dialog().querySelector('[role="alert"]'))
    await pause()
    if (cursors('media', 'next-page') !== 1) throw Error('Failed page retried automatically')
    await click(textButton('Tentar novamente', dialog()))
    await waitFor(() => !dialog().querySelector('[role="alert"]'))
    await waitFor(() => cursors('media', 'next-page') === 2)
    await scrollToEnd()
    await pause()
    if (cursors('media', 'next-page') !== 2 || libraryRequests().length !== 3)
      throw Error('More requests after successful retry or EOF')
  })
  await check('switching tabs isolates pending pages and their cursors', async () => {
    await mountScenario('pending')
    await waitFor(() => !!dialog().querySelector('button[aria-label^="Abrir imagem:"]'))
    await scrollToEnd()
    await waitFor(() => !!releasePending)
    await click(textButton('Documentos', dialog()))
    await waitFor(() => !!dialog().querySelector('button[aria-label^="Abrir documento "]'))
    await waitFor(() => cursors('document', 'document-next') === 1)
    releasePending?.()
    await pause()
    if (dialog().querySelector('button[aria-label^="Abrir imagem:"]'))
      throw Error('Pending media page appeared in documents')
    if (cursors('media', 'document-next') || cursors('document', 'next-page'))
      throw Error('Cursor leaked across tabs')
    if (cursors('document', 'document-next') !== 1) throw Error('Document page duplicated')
  })
  await check('underfilled pages load automatically until EOF', async () => {
    await mountScenario('underfilled')
    try {
      await waitFor(() => cursors('media', 'short-2') === 1)
    } catch {
      const panel = find('[role="dialog"] [role="tabpanel"]')
      const sentinel = panel.querySelector<HTMLElement>('[aria-hidden="true"].h-px')
      throw Error(
        `Underfilled stalled: ${JSON.stringify(libraryRequests())}; height ${panel.scrollHeight}/${panel.clientHeight}; images ${panel.querySelectorAll('button[aria-label^="Abrir imagem:"]').length}; sentinel ${sentinel?.getBoundingClientRect().top}/${panel.getBoundingClientRect().bottom}; alert ${dialog().querySelector('[role="alert"]')?.textContent}`,
      )
    }
    await pause()
    if (cursors('media', 'short-1') !== 1 || libraryRequests().length !== 3)
      throw Error('Underfilled pagination duplicated or continued past EOF')
    if (dialog().querySelectorAll('button[aria-label^="Abrir imagem:"]').length !== 3)
      throw Error('Underfilled pages did not all render')
  })
  await check('access denied prevents automatic library requests', async () => {
    await mountScenario('denied', true)
    await pause()
    if (libraryRequests().length) throw Error('Library fetched while access denied')
    const scenarioStore = await mountScenario('denied')
    await waitFor(() => !!dialog().querySelector('button[aria-label^="Abrir imagem:"]'))
    await act(async () => scenarioStore.set(chatAccessDeniedAtom, true))
    await scrollToEnd()
    await pause()
    if (libraryRequests().length !== 1) throw Error('Next page fetched after access was denied')
    await act(async () => root.render(null))
  })
  document.documentElement.dataset.results = JSON.stringify(results)
  document.documentElement.dataset.ready = 'true'
} else if (screenshot) {
  emptyDocuments = false
  await act(async () => {
    await client.refetchQueries({ type: 'active' })
  })
  if (screenshot === 'documents') await click(textButton('Documentos', dialog()))
  if (screenshot === 'modal-media') {
    await click(textButton('Mídia', dialog()))
    await waitFor(() => !!dialog().querySelector('button[aria-label^="Abrir imagem:"]'))
  }
  if (screenshot === 'summary' || screenshot === 'sidebar' || screenshot === 'audio-gallery') {
    const close = document.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[data-slot="dialog-close"]',
    )
    if (!close) throw Error('Missing modal close')
    await click(close)
    if (screenshot === 'sidebar' || screenshot === 'audio-gallery') {
      await click(textButton('Mídia', find('aside')))
      await waitFor(() => !!document.querySelector('aside button[aria-label^="Abrir imagem:"]'))
      if (screenshot === 'audio-gallery') {
        await click(find('aside button[aria-label^="Ouvir áudio:"]'))
        await waitFor(
          () => !!document.querySelector('[data-slot="media-gallery"] [data-slot="message-audio"]'),
        )
        await waitFor(
          () =>
            !!document.querySelector(
              '[data-slot="media-gallery"] button[aria-label="Reproduzir áudio"]',
            ),
        )
      }
    }
    if (screenshot === 'summary')
      await click(find('button[aria-label="Voltar para informações do contato"]'))
  }
  document.documentElement.dataset.results = JSON.stringify(results)
  document.documentElement.dataset.ready = 'true'
} else {
  await act(async () => root.unmount())
  client.clear()
  document.body.textContent = JSON.stringify(results)
}
