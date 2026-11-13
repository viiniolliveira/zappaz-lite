import { createRoot } from 'react-dom/client'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import { mockMessage } from './mock-data.ts'
import { mockThumbnailBase64 } from './mock-thumbnail.ts'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Fixture root missing')
const root = createRoot(rootElement)
const url = `https://example.com/${'longpath'.repeat(40)}`
const longText = `Mensagem completa ${'palavras longas e conteúdo '.repeat(40)}${url}`
const thumbnail = {
  mimeType: 'image/jpeg' as const,
  base64: mockThumbnailBase64,
  width: 80,
  height: 60,
}
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

async function run() {
  for (const panelWidth of [null, 240]) {
    for (const fromMe of [false, true]) {
      for (const withThumbnail of [false, true]) {
        for (const long of [false, true]) {
          const text = long ? longText : 'https://example.com/'
          const preview = {
            url: long ? url : text,
            title: long ? 'Título extremamente longo '.repeat(15) : null,
            description: long ? 'Descrição muito longa '.repeat(60) : null,
            thumbnail: withThumbnail ? thumbnail : null,
          }
          const message = mockMessage(1, '00000000-0000-4000-8000-000000000002', {
            text,
            fromMe,
            linkPreview: preview,
          })
          root.render(
            <main className="p-4">
              <ul style={{ width: panelWidth ?? '100%' }}>
                <MessageBubble message={message} />
              </ul>
            </main>,
          )
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          )
          const frame = rootElement.querySelector<HTMLElement>('li[data-message-id] > div')
          const card = frame?.querySelector<HTMLElement>('[data-slot="message-link-preview"]')
          const paragraph = frame?.querySelector<HTMLElement>('p.whitespace-pre-wrap')
          const panelElement = rootElement.querySelector('ul')
          if (!frame || !card || !paragraph || !panelElement)
            throw new Error('Message elements missing')
          const panel = panelElement.getBoundingClientRect()
          const box = frame.getBoundingClientRect()
          const rect = card.getBoundingClientRect()
          const label = `viewport ${innerWidth}, panel ${panelWidth}, fromMe ${fromMe}, thumbnail ${withThumbnail}, long ${long}`
          check(rect.width <= 353, `${label}: card too wide ${rect.width}`)
          const available = panel.width * (innerWidth >= 768 ? 0.85 : 0.88) - 10
          if (available >= 256) check(rect.width >= 255, `${label}: card too narrow ${rect.width}`)
          else {
            check(rect.width < 256, `${label}: card did not shrink ${rect.width}`)
            check(rect.width >= available - 2, `${label}: card too narrow ${rect.width}`)
          }
          check(
            box.left >= panel.left - 1 && box.right <= panel.right + 1,
            `${label}: bubble outside panel`,
          )
          check(
            rect.left >= box.left - 1 && rect.right <= box.right + 1,
            `${label}: card outside bubble`,
          )
          check(paragraph.textContent === text, `${label}: message text lost`)
          check(paragraph.scrollWidth <= paragraph.clientWidth + 1, `${label}: message overflows`)
          check(
            card.getAttribute('href') === preview.url &&
              card.getAttribute('rel') === 'noopener noreferrer',
            `${label}: unsafe or missing link`,
          )
          check(!!card.querySelector('img') === withThumbnail, `${label}: thumbnail mismatch`)
          check(
            document.documentElement.scrollWidth <= innerWidth + 1,
            `${label}: document overflows`,
          )
        }
      }
    }
  }
  root.unmount()
  document.body.textContent = 'ok'
}
if (new URLSearchParams(location.search).has('visual')) {
  const examples = [
    { text: 'https://example.com/', title: null, description: null, thumbnail: null },
    { text: 'https://example.com/', title: 'Um link curto', description: null, thumbnail },
    {
      text: `Confira esta mensagem com um link e texto suficiente para demonstrar a quebra de linha: ${url}`,
      title: 'Um título longo para conferir a apresentação do cartão de link no chat',
      description:
        'Uma descrição longa que mostra como o cartão se comporta quando o conteúdo ocupa várias linhas e o espaço disponível é limitado.',
      thumbnail: null,
    },
    {
      text: `Confira este artigo: ${url}`,
      title: 'Um título longo com uma imagem de prévia para o cartão de link',
      description:
        'Uma descrição longa que acompanha a imagem e deve permanecer dentro dos limites do cartão.',
      thumbnail,
    },
  ]
  root.render(
    <main className="p-4">
      <ul className="space-y-4">
        {examples.map((example, index) => (
          <MessageBubble
            key={example.title ?? 'domain-only'}
            message={mockMessage(index + 1, '00000000-0000-4000-8000-000000000002', {
              text: example.text,
              fromMe: index % 2 === 1,
              linkPreview: { ...example, url: index < 2 ? example.text : url },
            })}
          />
        ))}
      </ul>
    </main>,
  )
} else {
  run().catch((error) => {
    document.body.textContent = `FAIL: ${String(error)}`
  })
}
