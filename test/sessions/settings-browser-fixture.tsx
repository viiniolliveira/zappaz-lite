import '../../src/configure-zod.ts'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'jotai'
import { ThemeProvider } from '../../src/components/theme-provider.tsx'
import SessionSettings from '../../src/pages/session-detail/components/session-settings.tsx'
import type { SessionSchema } from '../../src/services/types.ts'
import { requests, setFailure } from './settings-mutation-fixture.ts'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const session: SessionSchema = {
  id: 'session-1',
  displayName: 'Sessão teste',
  status: 'open',
  jid: '',
  profilePictureUrl: '',
  enabled: true,
  archived: false,
  userId: 'user-1',
  config: {
    signatureEnabled: false,
    signatureName: '',
    syncFullHistory: false,
    ignoreGroups: false,
    markOnlineOnConnect: false,
    rejectCalls: false,
    messageOnCall: 'Ocupado',
  },
}
const root = createRoot(document.getElementById('root')!)
async function render(value: SessionSchema) {
  await act(async () =>
    root.render(
      createElement(
        Provider,
        null,
        createElement(
          ThemeProvider,
          { attribute: 'class', defaultTheme: 'light' },
          createElement(SessionSettings, { session: value }),
        ),
      ),
    ),
  )
}
function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector)
  if (!result) throw Error(`Missing ${selector}`)
  return result
}
function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  )
  if (!result) throw Error(`Missing button ${text}`)
  return result
}
async function click(target: HTMLElement) {
  await act(async () => {
    target.click()
    await Promise.resolve()
  })
}
async function input(selector: string, value: string) {
  await act(async () => {
    const target = element<HTMLInputElement>(selector)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
await render(session)
await check('signature validation clears on typing and save sends all settings once', async () => {
  assert(button('Salvar alterações').disabled, 'Clean form should not be saveable')
  await click(element('#signature-enabled'))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
  })
  assert(requests.length === 0, 'Switch auto-saved')
  assert(!button('Salvar alterações').disabled, 'Dirty switch did not enable save')
  await click(button('Salvar alterações'))
  assert(
    document.querySelector('[role="alert"]')?.textContent ===
      'Informe um nome para ativar a assinatura',
    'Missing name validation',
  )
  assert(requests.length === 0, 'Invalid form submitted')
  await input('#signature-name', 'A.I')
  assert(!document.querySelector('[role="alert"]'), 'Validation error stayed after typing')
  assert(
    document.querySelector('strong')?.textContent === 'A.I:',
    'Preview should append a colon to the name',
  )
  assert(!button('Salvar alterações').disabled, 'Valid edit cannot be saved')
  await click(button('Salvar alterações'))
  assert(requests.length === 1, 'Expected exactly one update')
  const expected = {
    id: 'session-1',
    req: {
      config: {
        signatureEnabled: true,
        signatureName: 'A.I',
        syncFullHistory: false,
        ignoreGroups: false,
        markOnlineOnConnect: false,
        rejectCalls: false,
        messageOnCall: 'Ocupado',
      },
    },
  }
  assert(
    JSON.stringify(requests[0]) === JSON.stringify(expected),
    `Wrong update: ${JSON.stringify(requests[0])}`,
  )
  assert(button('Salvar alterações').disabled, 'Successful save did not reset dirty state')
})
await check('each independent switch enables save without auto-saving', async () => {
  for (const id of ['syncFullHistory', 'ignoreGroups', 'markOnlineOnConnect', 'reject-calls']) {
    const before = requests.length
    await click(element(`#${id}`))
    assert(!button('Salvar alterações').disabled, `${id} did not dirty form`)
    assert(requests.length === before, `${id} auto-saved`)
    await click(button('Descartar'))
    assert(button('Salvar alterações').disabled, `${id} discard did not reset`)
  }
})
await check('failed save retains edits and discard restores saved values', async () => {
  setFailure(true)
  await input('#signature-name', 'Operador')
  await click(element('#ignoreGroups'))
  await click(button('Salvar alterações'))
  assert(requests.length === 2, 'Failed save was not attempted')
  assert(
    element<HTMLInputElement>('#signature-name').value === 'Operador',
    'Failed save lost input',
  )
  assert(
    element('#ignoreGroups').getAttribute('aria-checked') === 'true',
    'Failed save lost switch',
  )
  assert(!button('Salvar alterações').disabled, 'Failed save cleared dirty state')
  await click(button('Descartar'))
  assert(
    element<HTMLInputElement>('#signature-name').value === 'A.I',
    'Discard did not restore saved name',
  )
  assert(
    element('#ignoreGroups').getAttribute('aria-checked') === 'false',
    'Discard did not restore saved switch',
  )
  assert(button('Salvar alterações').disabled, 'Discard did not clear dirty state')
  setFailure(false)
})
await check('refetch preserves dirty values and applies untouched settings', async () => {
  await input('#signature-name', 'Em edição')
  await render({
    ...session,
    config: { ...session.config, signatureEnabled: true, signatureName: 'A.I', rejectCalls: true },
  })
  assert(
    element<HTMLInputElement>('#signature-name').value === 'Em edição',
    'Refetch lost dirty value',
  )
  assert(
    element('#reject-calls').getAttribute('aria-checked') === 'true',
    'Refetch did not update clean value',
  )
})
await check('layout stays within viewport', async () => {
  assert(
    document.documentElement.scrollWidth <= window.innerWidth,
    `Horizontal overflow: ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
  )
})
document.body.dataset.results = JSON.stringify(results)
