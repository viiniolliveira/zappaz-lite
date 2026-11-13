import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import MessageHistory from '../../src/components/chat/message-history'
import { mockMessage } from './mock-data'

const conversationId = '00000000-0000-4000-8000-000000000001'
const older = mockMessage(100, conversationId, { text: 'Mensagem antiga' })
const original = mockMessage(1, conversationId, { text: 'Mensagem original' })
const reply = (index: number, target: typeof original) => mockMessage(index, conversationId, { text: 'Resposta', replyTo: { messageRecordId: target.id, messageId: target.messageId, senderJid: null, type: 'text', text: target.text, contacts: [], media: null } })
const recent = [original, ...Array.from({ length: 15 }, (_, i) => mockMessage(i + 2, conversationId, { text: `Mensagem ${i}` })), reply(30, original), reply(31, older)]

function Fixture() {
  const [messages, setMessages] = useState(recent)
  const [hasOlder, setHasOlder] = useState(true)
  return <MessageHistory conversationId={conversationId} displayName="Contato" messages={messages} hasOlder={hasOlder} onLoadOlder={async () => { await new Promise(resolve => setTimeout(resolve, 50)); setMessages(current => [older, ...current]); setHasOlder(false) }} />
}

const wait = async (predicate: () => boolean, label: string) => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error(label) }
async function run() {
  window.fetch = () => Promise.reject(new Error('network forbidden'))
  const root = createRoot(document.getElementById('root')!)
  root.render(<Fixture />)
  await wait(() => document.querySelectorAll('button[aria-label="Ir para mensagem citada"]').length === 2, 'replies rendered')
  const replies = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Ir para mensagem citada"]')
  replies[0].click()
  const target = () => document.querySelector<HTMLElement>(`[data-message-id="${original.id}"]`)
  await wait(() => !!target()?.classList.contains('bg-primary/20'), 'loaded message highlighted')
  await new Promise(resolve => setTimeout(resolve, 1100))
  if (target()?.classList.contains('bg-primary/20')) throw new Error('highlight lasts more than one second')
  replies[1].click()
  await wait(() => !!document.querySelector(`[data-message-id="${older.id}"].bg-primary\\/20`), 'older message loaded and highlighted')
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
