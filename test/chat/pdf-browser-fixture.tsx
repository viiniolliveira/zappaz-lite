import '../../src/configure-zod.ts'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getDefaultStore } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import AttachmentPreview from '../../src/components/chat/attachment-preview'
import AttachmentWorkspace from '../../src/components/chat/attachment-workspace'
import MediaGallery from '../../src/components/chat/media-gallery'
import { api } from '../../src/lib/api-client'
import { getChatMediaMessages } from '../../src/lib/chat/media-library'
import { mockConversations, mockSessionId } from './mock-data'
import '../../src/global.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
queryClient.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
getDefaultStore().set(queryClientAtom, queryClient)

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing fixture value')
  return value
}

function pdf(landscape = false, pages = 3) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>',
    '',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
    '',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  for (let i = 0; i < 3; i++) {
    const stream = `BT /F1 28 Tf 40 400 Td (Page ${i + 1} fixture) Tj ET`
    objects[3 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  }
  if (pages === 1) objects[1] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  if (landscape) objects[2] = objects[2].replace('400 500', '600 300')
  let text = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(text.length)
    text += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = text.length
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Blob([text], { type: 'application/pdf' })
}
const conversation = mockConversations[0]
const original = required(conversation.messages.find((message) => message.type === 'document'))
const message = {
  ...original,
  media: { ...required(original.media), mimeType: 'application/pdf', fileName: 'fixture.pdf' },
}
const good = pdf()
function Fixture() {
  const [mode, setMode] = useState<'good' | 'bad' | null>(null)
  return (
    <>
      <button type="button" id="open" onClick={() => setMode('good')}>
        Abrir
      </button>
      <button type="button" id="bad" onClick={() => setMode('bad')}>
        Corrompido
      </button>
      {mode && (
        <MediaGallery
          messages={[message]}
          sessionId={mockSessionId}
          conversationId={conversation.id}
          displayName="Contato"
          initialMessageId={message.id}
          initialBlob={mode === 'good' ? good : new Blob(['invalid'], { type: 'application/pdf' })}
          onClose={() => setMode(null)}
          onRestoreFocus={() => document.getElementById('open')?.focus()}
        />
      )}
    </>
  )
}
const wait = async (condition: () => unknown, label: string) => {
  for (let i = 0; i < 500; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timeout ${label}: ${document.body.innerText}`)
}
function check(value: unknown, label: string) {
  if (!value) throw new Error(label)
}
function button(label: string) {
  const item = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!item) throw new Error(`Missing ${label}`)
  return item
}
async function run() {
  const root = createRoot(required(document.getElementById('root')))
  root.render(<Fixture />)
  await wait(() => document.getElementById('open'), 'trigger')
  const open = required(document.getElementById('open'))
  open.focus()
  open.click()
  await wait(() => document.querySelector('[data-pdf-page="1"] canvas'), 'canvas')
  await wait(
    () =>
      document
        .querySelector('[data-pdf-page="1"] .textLayer')
        ?.textContent?.includes('Page 1 fixture'),
    'text',
  )
  check(document.querySelectorAll('[data-pdf-page]').length === 3, 'three pages')
  check(
    !document.querySelector('[data-slot="media-gallery"], [data-slot="carousel"], iframe'),
    'no gallery or iframe',
  )
  const download = document.querySelector<HTMLAnchorElement>('a[aria-label="Baixar PDF"]')
  check(download?.download === 'fixture.pdf' && download.href.startsWith('blob:'), 'download link')
  const canvas = required(document.querySelector<HTMLCanvasElement>('canvas'))
  await wait(() => {
    const data = required(canvas.getContext('2d')).getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data
    return data.some((value, i) => i % 4 !== 3 && value < 100)
  }, 'painted pixels')
  const zoom = required(document.querySelector('[aria-label="Zoom do PDF"]'))
  button('Aumentar zoom').click()
  await wait(() => zoom.textContent === '125%', 'zoom in')
  for (let i = 0; i < 10; i++) {
    button('Aumentar zoom').click()
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await wait(() => zoom.textContent === '300%' && button('Aumentar zoom').disabled, 'maximum zoom')
  for (let i = 0; i < 10; i++) {
    button('Diminuir zoom').click()
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await wait(() => zoom.textContent === '50%' && button('Diminuir zoom').disabled, 'minimum zoom')
  button('Ajustar à largura').click()
  await wait(() => zoom.textContent === '100%', 'reset zoom')
  button('Próxima página').click()
  await wait(
    () =>
      (document.querySelector('[aria-label="Página do PDF"]') as HTMLInputElement).value === '2',
    'next page',
  )
  const input = required(document.querySelector<HTMLInputElement>('[aria-label="Página do PDF"]'))
  const setPage = (value: string) => {
    required(
      required(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')).set,
    ).call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
  setPage('99')
  await wait(() => input.value === '3' && button('Próxima página').disabled, 'clamp to last page')
  setPage('0')
  await wait(() => input.value === '1' && button('Página anterior').disabled, 'clamp to first page')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(() => !document.querySelector('[data-slot="pdf-viewer"]'), 'close')
  await wait(() => document.activeElement === open, 'focus restore')
  required(document.getElementById('bad')).click()
  await wait(
    () => document.querySelector('[role="alert"]')?.textContent?.includes('danificado'),
    'corrupt error',
  )
  check(!!document.querySelector('a[aria-label="Baixar PDF"]'), 'corrupt file download')
  required(
    [...document.querySelectorAll('button')].find(
      (item) => item.textContent === 'Tentar novamente',
    ),
  ).click()
  await wait(
    () => document.querySelector('[role="alert"]')?.textContent?.includes('danificado'),
    'corrupt retry',
  )
  root.unmount()
  document.body.textContent = 'ok'
}
const image = required(conversation.messages.find((item) => item.type === 'image'))
const galleryMessages = [
  { ...image, orderAt: '2025-01-01T00:00:00.000Z' },
  { ...message, orderAt: '2025-01-02T00:00:00.000Z' },
]

function GalleryFixture() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button id="open-gallery" type="button" onClick={() => setOpen(true)}>
        Abrir galeria
      </button>
      {open && (
        <MediaGallery
          messages={galleryMessages}
          sessionId={mockSessionId}
          conversationId={conversation.id}
          displayName="Contato"
          initialMessageId={image.id}
          initialBlob={null}
          onClose={() => setOpen(false)}
          onRestoreFocus={() => document.getElementById('open-gallery')?.focus()}
        />
      )}
    </>
  )
}

async function runGallery() {
  const items = getChatMediaMessages(galleryMessages, mockSessionId, conversation.id)
  api.defaults.adapter = async (config) => ({
    config,
    data: config.url?.endsWith('/media')
      ? {
          status: 'success',
          data: items.map((item) => ({ ...item.media, message: item })),
          count: 2,
          page: { hasMore: false, nextCursor: null },
        }
      : config.url?.includes(message.media.id)
        ? good
        : new Blob([], { type: 'image/png' }),
    status: 200,
    statusText: 'OK',
    headers: {},
  })
  const root = createRoot(required(document.getElementById('root')))
  root.render(<GalleryFixture />)
  await wait(() => document.getElementById('open-gallery'), 'gallery trigger')
  required(document.getElementById('open-gallery')).click()
  await wait(
    () => document.querySelector('[aria-current="true"][aria-label="Abrir imagem 1"]'),
    'image selected',
  )
  await wait(() => document.querySelector('[aria-label="Abrir documento 2"]'), 'PDF thumbnail')
  button('Próxima mídia').click()
  await wait(
    () => document.querySelector('[aria-current="true"][aria-label="Abrir documento 2"]'),
    'arrow selects PDF',
  )
  check(!document.querySelector('[data-slot="pdf-viewer"]'), 'arrow must not open PDF viewer')
  const openPdf = () =>
    required(
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.trim() === 'Abrir PDF',
      ),
    )
  await wait(
    () =>
      [...document.querySelectorAll('button')].some(
        (item) => item.textContent?.trim() === 'Abrir PDF',
      ),
    'PDF placeholder',
  )
  check(
    document
      .querySelector('[data-slot="media-gallery-preview"]')
      ?.textContent?.includes('fixture.pdf'),
    'PDF placeholder filename',
  )
  button('Abrir imagem 1').click()
  await wait(
    () => document.querySelector('[aria-current="true"][aria-label="Abrir imagem 1"]'),
    'return to image',
  )
  button('Abrir documento 2').click()
  await wait(
    () => document.querySelector('[aria-current="true"][aria-label="Abrir documento 2"]'),
    'thumbnail selects PDF',
  )
  check(!document.querySelector('[data-slot="pdf-viewer"]'), 'thumbnail must not open PDF viewer')
  openPdf().click()
  await wait(() => document.querySelector('[data-pdf-page="1"] canvas'), 'explicit PDF viewer')
  button('Fechar PDF').click()
  await wait(() => !document.querySelector('[data-slot="pdf-viewer"]'), 'close PDF only')
  check(document.querySelector('[data-slot="media-gallery"]'), 'gallery remains open')
  check(
    document.querySelector('[aria-current="true"][aria-label="Abrir documento 2"]'),
    'PDF selection retained',
  )
  await wait(() => document.activeElement === openPdf(), 'focus returns to open PDF')
  root.unmount()
  document.body.textContent = 'ok'
}
function PreviewFixture() {
  const [file, setFile] = useState<File | null>(
    new File([pdf()], 'portrait.pdf', { type: 'application/pdf' }),
  )
  const [mobile, setMobile] = useState(false)
  return (
    <>
      <button
        type="button"
        id="landscape"
        onClick={() => setFile(new File([pdf(true)], 'landscape.pdf', { type: 'application/pdf' }))}
      >
        Paisagem
      </button>
      <button
        type="button"
        id="corrupt"
        onClick={() => setFile(new File(['invalid'], 'broken.pdf', { type: 'application/pdf' }))}
      >
        Corrompido
      </button>
      <button type="button" id="mobile" onClick={() => setMobile(!mobile)}>
        Redimensionar
      </button>
      <button type="button" id="cancel" onClick={() => setFile(null)}>
        Cancelar
      </button>
      <div id="box" style={{ width: mobile ? 240 : 640, height: mobile ? 300 : 420 }}>
        {file && <AttachmentPreview file={file} />}
      </div>
      <div id="thumbnail">{file && <AttachmentPreview file={file} thumbnail />}</div>
      <button type="button" id="send">
        Enviar
      </button>
    </>
  )
}
async function runPreview() {
  const root = createRoot(required(document.getElementById('root')))
  root.render(<PreviewFixture />)
  const canvas = () => document.querySelector<HTMLCanvasElement>('#box canvas')
  await wait(() => canvas()?.width, 'portrait canvas')
  const inspect = () => {
    const box = required(document.getElementById('box')).getBoundingClientRect()
    const page = required(canvas()).getBoundingClientRect()
    check(
      page.width <= box.width + 1 && page.height <= box.height + 1,
      `page fits ${page.width}x${page.height} in ${box.width}x${box.height}`,
    )
    check(document.querySelectorAll('#box canvas').length === 1, 'only first canvas')
    check(
      !document.querySelector(
        '#thumbnail canvas, iframe, .textLayer, .annotationLayer, [aria-label="Controles do PDF"]',
      ),
      'no preview controls or thumbnail rendering',
    )
  }
  inspect()
  required(document.getElementById('mobile')).click()
  await wait(
    () =>
      required(document.getElementById('box')).getBoundingClientRect().width === 240 &&
      required(canvas()).getBoundingClientRect().width < 241,
    'mobile size',
  )
  inspect()
  required(document.getElementById('landscape')).click()
  await wait(
    () => !!document.querySelector('[aria-label="Primeira página de landscape.pdf"] canvas'),
    'landscape',
  )
  await wait(
    () =>
      required(canvas()).getBoundingClientRect().width >
      required(canvas()).getBoundingClientRect().height,
    'landscape ratio',
  )
  inspect()
  required(document.getElementById('corrupt')).click()
  await wait(
    () => document.querySelector('[role="alert"]')?.textContent?.includes('Você ainda pode enviar'),
    'corrupt preview',
  )
  check(!(document.getElementById('send') as HTMLButtonElement).disabled, 'send remains enabled')
  required(document.getElementById('cancel')).click()
  await wait(
    () => !document.querySelector('#box canvas, #box [role="alert"]'),
    'cancel cleans preview',
  )
  root.unmount()
  document.body.textContent = 'ok'
}
function WorkspaceFixture() {
  return (
    <div style={{ height: 700, display: 'flex' }}>
      <AttachmentWorkspace draftKey="pdf-workspace-test" onSend={() => true}>
        <p>Conversa</p>
      </AttachmentWorkspace>
    </div>
  )
}
async function runWorkspace() {
  const root = createRoot(required(document.getElementById('root')))
  root.render(<WorkspaceFixture />)
  await wait(() => document.querySelector('input[aria-label="Anexar arquivo"]'), 'attachment input')
  const input = required(
    document.querySelector<HTMLInputElement>('input[aria-label="Anexar arquivo"]'),
  )
  const transfer = new DataTransfer()
  transfer.items.add(new File([pdf()], 'three.pdf', { type: 'application/pdf' }))
  transfer.items.add(new File([pdf(false, 1)], 'one.pdf', { type: 'application/pdf' }))
  transfer.items.add(new File(['invalid'], 'bad.pdf', { type: 'application/pdf' }))
  Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  const header = () => document.querySelector('[aria-label="Preparar envio de arquivos"] > header')
  await wait(() => header()?.textContent?.includes('3 páginas'), 'three page count')
  check(header()?.querySelector('h3')?.textContent === 'three.pdf', 'three page filename')
  button('Selecionar arquivo 2: one.pdf').click()
  await wait(() => header()?.querySelector('h3')?.textContent === 'one.pdf', 'one filename')
  check(!header()?.textContent?.includes('3 páginas'), 'previous count must not leak')
  await wait(() => header()?.textContent?.includes('1 página'), 'singular page count')
  button('Selecionar arquivo 3: bad.pdf').click()
  await wait(() => header()?.querySelector('h3')?.textContent === 'bad.pdf', 'bad filename')
  check(!header()?.textContent?.includes('1 página'), 'count must not leak to corrupt PDF')
  await wait(
    () => document.querySelector('[role="alert"]')?.textContent?.includes('Você ainda pode enviar'),
    'workspace corrupt preview',
  )
  check(!button('Enviar 3 arquivos').disabled, 'corrupt preview must not block sending')
  button('Cancelar envio de arquivos').click()
  await wait(
    () => [...document.querySelectorAll('button')].some((item) => item.textContent === 'Descartar'),
    'discard dialog',
  )
  required(
    [...document.querySelectorAll('button')].find((item) => item.textContent === 'Descartar'),
  ).click()
  await wait(
    () => !document.querySelector('[aria-label="Preparar envio de arquivos"]'),
    'discard clears queue',
  )
  root.unmount()
  document.body.textContent = 'ok'
}
const params = new URLSearchParams(location.search)
if (params.has('previewvisual'))
  createRoot(required(document.getElementById('root'))).render(<PreviewFixture />)
else if (params.has('visual'))
  createRoot(required(document.getElementById('root'))).render(<Fixture />)
else if (params.has('workspace'))
  runWorkspace().catch((error) => {
    document.body.textContent = `FAIL: ${String(error)}`
  })
else if (params.has('gallery'))
  runGallery().catch((error) => {
    document.body.textContent = `FAIL: ${String(error)}`
  })
else if (params.has('preview'))
  runPreview().catch((error) => {
    document.body.textContent = `FAIL: ${String(error)}`
  })
else
  run().catch((error) => {
    document.body.textContent = `FAIL: ${String(error)}`
  })
