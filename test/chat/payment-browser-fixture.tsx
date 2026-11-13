import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import MessagePayment from '../../src/components/chat/messages/message-payment'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario')
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const calls: string[] = []
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
  writeText: async (value: string) => {
    calls.push(value)
    if (scenario === 'failure') throw new Error('synthetic clipboard failure')
  },
} })

const payment = {
  referenceId: 'referencia-sintetica', currency: 'BRL', totalAmount: { value: 1500, offset: 100 },
  items: [{ name: 'Recarga', quantity: 1 }], pixCode: 'PIX-SINTETICO-SEM-DADOS-PESSOAIS',
}
const root = createRoot(document.getElementById('root')!)
root.render(<><div id="container" style={{ width: 280, maxWidth: '100%' }}>
  <MessagePayment payment={payment} disabled={scenario === 'disabled'} footer="Rodapé" metadata={<span>12:34</span>}>Corpo</MessagePayment>
</div><Toaster /></>)

const wait = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(label)
}

async function run() {
  await wait(() => !!document.querySelector('button'), 'button did not render')
  const button = document.querySelector<HTMLButtonElement>('button')!
  button.click()
  if (scenario !== 'disabled') await wait(() => !!document.querySelector('[data-sonner-toast]'), 'toast did not render')
  else await new Promise(resolve => setTimeout(resolve, 200))
  const card = document.querySelector<HTMLElement>('[data-slot="message-payment"]')!
  const container = document.querySelector<HTMLElement>('#container')!
  const rect = card.getBoundingClientRect()
  const parentRect = container.getBoundingClientRect()
  document.body.dataset.result = JSON.stringify({
    calls, disabled: button.disabled, buttonType: button.type,
    toasts: Array.from(document.querySelectorAll<HTMLElement>('[data-sonner-toast]')).map(toast => ({ type: toast.dataset.type, text: toast.textContent })),
    layout: { left: rect.left, right: rect.right, parentLeft: parentRect.left, parentRight: parentRect.right, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, viewport: window.innerWidth, css: getComputedStyle(document.documentElement).getPropertyValue('--popover').trim() },
  })
}
run().catch(error => { document.body.dataset.error = String(error) })
