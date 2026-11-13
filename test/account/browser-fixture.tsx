import { QueryClient } from '@tanstack/react-query'
import { Provider, createStore } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AppSidebar } from '../../src/components/layout/app-sidebar'
import { SidebarProvider } from '../../src/components/ui/sidebar'
import { AdminLayout } from '../../src/layouts/admin-layout'
import SettingsPage from '../../src/pages/settings-page'
import ApiKeysPage from '../../src/pages/api-keys-page'
import UsersTable from '../../src/components/users/UsersTable'
import ManagedUserForm from '../../src/components/users/ManagedUserForm'
import { api } from '../../src/lib/api-client'

api.defaults.adapter = 'fetch'

const root = createRoot(document.getElementById('root')!)
const user = { id: 'u1', firstName: 'Maria', lastName: 'Silva', email: 'maria@example.com', phone: '5511999999999', role: 'USER' }
const wait = async (condition: () => unknown, message: string) => {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error(message)
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const text = () => document.body.innerText ?? ''
const link = (label: string) => document.querySelector(`a[aria-label="${label}"]`)
const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const fill = (name: string, value: string) => {
  const field = input(name)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = (name: string) => input(name).closest('form')!.requestSubmit()

async function main() {
  let mode = ''
  let userRequests = 0
  let managementRequests = 0
  let passwordRequests: unknown[] = []
  let passwordFails = true
  let profileFails = true
  let profileRequests = 0
  const managedUpdates: { userId: string; data: { phone: string | null } }[] = []
  const managedCreates: { data: { phone: string | null } }[] = []
  let apiKeys: { id: string; name: string; start: string; expiresAt: string | null; createdAt: string; enabled: boolean; lastRequest: null }[] = []
  const keyCreates: { name: string; expiresIn: number | null; metadata: { scope: string; sessionId?: string } }[] = []
  let keyDeletes = 0
  ;(window as typeof window & { __fixtureFetch: typeof fetch }).__fixtureFetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = options?.body ? JSON.parse(String(options.body)) : undefined
    if (url.includes('/api/v1/session')) return Response.json({ data: url.includes('archived=true') ? [] : [{ id: 'session-a', displayName: 'Sessão de atendimento com um nome muito longo para testar os limites do formulário e do seletor' }], total: url.includes('archived=true') ? 0 : 1 })
    if (url.includes('/api/auth/api-key/list')) return Response.json({ apiKeys, total: apiKeys.length })
    if (url.includes('/api/auth/api-key/create')) {
      keyCreates.push(body)
      const key = { id: `key-${keyCreates.length}`, name: body.name, start: 'zappaz_start', expiresAt: body.expiresIn === null ? null : '2027-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', enabled: true, lastRequest: null }
      apiKeys.push(key)
      return Response.json({ ...key, key: `zappaz_secret_${keyCreates.length}` })
    }
    if (url.includes('/api/auth/api-key/delete')) { keyDeletes++; apiKeys = apiKeys.filter(key => key.id !== body.keyId); return Response.json({ success: true }) }
    if (url.includes('/api/auth/get-session')) {
      userRequests++
      if (mode === 'pending') return new Promise(() => {})
      if (mode === 'unauthorized') return Response.json({ message: 'expired' }, { status: 401 })
      if (mode === 'error') return Response.json({ message: 'offline' }, { status: 500 })
      const date = '2026-01-01T00:00:00.000Z'
      return Response.json({ user: { ...user, name: user.firstName, role: mode === 'admin' ? 'ADMIN' : 'USER', emailVerified: false, createdAt: date, updatedAt: date }, session: { id: 's1', userId: 'u1', token: 't', createdAt: date, updatedAt: date, expiresAt: '2030-01-01T00:00:00.000Z' } })
    }
    if (url.includes('/api/auth/admin/list-users')) { managementRequests++; return Response.json({ users: [], total: 0 }) }
    if (url.includes('/api/auth/admin/update-user')) { managedUpdates.push(body); return Response.json({ user: { ...user, name: user.firstName } }) }
    if (url.includes('/api/auth/admin/create-user')) { managedCreates.push(body); return Response.json({ user: { ...user, name: user.firstName } }) }
    if (url.includes('/api/auth/admin/set-role')) return Response.json({ user: { ...user, name: user.firstName } })
    if (url.includes('/api/auth/change-password')) {
      passwordRequests.push(body)
      if (passwordFails) return Response.json({ message: 'Senha incorreta' }, { status: 400 })
      return Response.json({ status: true })
    }
    if (url.includes('/api/auth/update-user')) {
      profileRequests++
      if (profileFails) return Response.json({ message: 'Falha ao salvar' }, { status: 500 })
      return Response.json({ status: true })
    }
    throw new Error(`Unexpected request ${url}`)
  }
  const mount = (scenario: string, path: string) => {
    mode = scenario
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
    const store = createStore(); store.set(queryClientAtom, client)
    root.render(<Provider store={store}><MemoryRouter key={scenario + path} initialEntries={[path]}><SidebarProvider><Toaster /><AppSidebar /><Routes>
      <Route element={<AdminLayout />}><Route path="/users" element={<><p>Área administrativa</p><UsersTable /></>} /></Route>
      <Route path="/account" element={<SettingsPage />} /><Route path="/api-keys" element={<ApiKeysPage />} /><Route path="/sign-in" element={<p>Login fixture</p>} />
    </Routes></SidebarProvider></MemoryRouter></Provider>)
    return client
  }
  mount('pending', '/users')
  await wait(() => !!document.querySelector('[aria-label="Verificando permissões"]'), 'guard loading missing')
  check(!text().includes('Área administrativa') && !link('Usuários'), 'pending exposed admin UI')
  mount('unauthorized', '/users')
  await wait(() => text().includes('Login fixture'), '401 did not redirect to sign-in')
  check(!link('Usuários'), '401 exposed admin menu')
  mount('error', '/users')
  await wait(() => text().includes('Não foi possível verificar suas permissões.'), 'guard error missing')
  const beforeRetry = userRequests
  ;[...document.querySelectorAll('button')].find(button => button.textContent?.includes('Tentar novamente'))!.click()
  await wait(() => userRequests > beforeRetry, 'guard retry did not refetch')
  check(!link('Usuários'), 'error exposed admin menu')
  mount('user', '/users')
  await wait(() => text().includes('Dados pessoais'), 'USER did not redirect to account')
  check(!!link('Minha conta') && !link('Usuários'), 'USER sidebar permissions incorrect')
  check(!text().includes('Área administrativa') && managementRequests === 0, 'USER triggered users view/query')
  check(text().includes('Alterar senha'), 'account password section missing')
  fill('firstName', 'Alterado')
  submit('firstName')
  await wait(() => profileRequests === 1 && text().includes('Falha ao salvar'), 'profile error not displayed')
  check(input('firstName').value === 'Alterado', 'profile values lost after error')
  profileFails = false
  submit('firstName')
  await wait(() => profileRequests === 2 && input('firstName').closest('form')!.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled, 'profile success did not reset dirty state')
  fill('currentPassword', 'old-password'); fill('password', 'new-password'); fill('confirmPassword', 'new-password')
  submit('currentPassword')
  await wait(() => passwordRequests.length === 1 && text().includes('Senha incorreta'), 'password error not displayed')
  check(input('currentPassword').value === 'old-password' && input('password').value === 'new-password', 'passwords lost after failed request')
  passwordFails = false
  submit('currentPassword')
  await wait(() => passwordRequests.length === 2 && input('password').value === '', 'password inputs not reset on success')
  check(input('currentPassword').value === '' && input('confirmPassword').value === '', 'password reset incomplete')
  check(JSON.stringify(passwordRequests[1]) === JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password', revokeOtherSessions: true }), 'password payload incorrect')
  check(!document.querySelector('input[name="name"]'), 'account must not contain key creation form')
  mount('user', '/api-keys')
  await wait(() => text().includes('Nenhuma chave criada'), 'API key empty state missing')
  check(link('Chaves de API')?.getAttribute('aria-current') === 'page', 'key menu not active')
  const clickButton = (label: string) => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === label)!.click()
  clickButton('Nova chave')
  await wait(() => !!document.querySelector('input[name="name"]'), 'creation modal missing')
  const choose = async (index: number, label: string) => {
    const trigger = () => document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[role="combobox"]')[index]
    await wait(() => trigger() && !trigger().disabled && !trigger().closest('fieldset')?.disabled, 'creation form is still pending')
    trigger().dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerType: 'mouse', bubbles: true }))
    await wait(() => !![...document.querySelectorAll('[role="option"]')].find(option => option.textContent === label), `option missing: ${label}`)
    ;[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === label)!.click()
    await wait(() => trigger()?.textContent?.includes(label) && !document.querySelector('[role="option"]'), `selection did not close: ${label}`)
  }
  check([...document.querySelectorAll('[role="dialog"] label')].map(label => label.textContent).join(',') === 'Nome,Acesso,Validade', 'incorrect field order')
  await choose(0, 'Global — todas as sessões permitidas')
  fill('name', 'CRM'); submit('name')
  await wait(() => !!document.querySelector('[aria-label="Chave de API criada"]'), 'created key secret missing')
  check(keyCreates[0].name === 'CRM' && keyCreates[0].expiresIn === 90 * 86400, 'key name/expiration incorrect')
  check(keyCreates[0].metadata.scope === 'global', 'global scope missing')
  check(document.querySelector<HTMLInputElement>('[aria-label="Chave de API criada"]')?.value === 'zappaz_secret_1', 'wrong secret')
  clickButton('Já guardei a chave')
  await wait(() => !document.querySelector('[aria-label="Chave de API criada"]'), 'secret persisted after closing')
  clickButton('Nova chave')
  await wait(() => !!document.querySelector('input[name="name"]'), 'second creation modal missing')
  await wait(() => document.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled === false, 'second creation form not ready')
  fill('name', 'ERP')
  await choose(0, 'Sessão de atendimento com um nome muito longo para testar os limites do formulário e do seletor')
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  check(dialog.scrollWidth <= dialog.clientWidth + 1, 'long session name overflowed dialog')
  check(!document.querySelectorAll('[role="combobox"]')[0].textContent?.includes('session-a'), 'session id must not be visible')
  await choose(1, 'Sem expiração')
  submit('name')
  await wait(() => keyCreates.length === 2 && !!document.querySelector('[aria-label="Chave de API criada"]'), 'second key creation failed')
  check(keyCreates[1].expiresIn === null, 'no expiration ignored')
  check(keyCreates[1].metadata.scope === 'session' && keyCreates[1].metadata.sessionId === 'session-a', 'session scope missing')
  clickButton('Já guardei a chave')
  await wait(() => document.querySelectorAll('button[aria-label^="Ações da chave"]').length === 2, 'multiple keys not listed')
  check(text().includes('Sem expiração') && text().includes('Nunca utilizada'), 'table metadata missing')
  const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar chaves por nome"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'ERP')
  search.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => document.querySelectorAll('button[aria-label^="Ações da chave"]').length === 1, 'search did not filter keys')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, '')
  search.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => document.querySelectorAll('button[aria-label^="Ações da chave"]').length === 2, 'search did not reset')
  const openRevoke = async () => {
    document.querySelector<HTMLButtonElement>('[aria-label="Ações da chave CRM"]')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerType: 'mouse', bubbles: true }))
    await wait(() => !!document.querySelector('[role="menuitem"]'), 'key actions missing')
    document.querySelector<HTMLElement>('[role="menuitem"]')!.click()
  }
  await openRevoke()
  await wait(() => text().includes('Revogar chave?'), 'revocation confirmation missing')
  clickButton('Cancelar')
  await wait(() => !document.querySelector('[role="dialog"]'), 'cancel did not close revocation')
  check(keyDeletes === 0, 'cancel revoked a key')
  await openRevoke()
  await wait(() => text().includes('Revogar chave?'), 'second confirmation missing')
  clickButton('Revogar chave')
  await wait(() => keyDeletes === 1 && !document.querySelector('[role="dialog"]'), 'revocation failed')
  check(apiKeys.length === 1 && apiKeys[0].name === 'ERP', 'revocation affected another key')
  mount('admin', '/users')
  await wait(() => text().includes('Área administrativa'), 'ADMIN cannot access guarded content')
  check(!!link('Usuários') && !!link('Minha conta'), 'ADMIN menu missing')
  check(link('Usuários')?.getAttribute('aria-current') === 'page', 'Usuários must be active on /users')
  check(!link('Uso')?.hasAttribute('aria-current'), 'Uso must not be active on /users')
  const activeLinks = [...document.querySelectorAll('[data-slot="sidebar"] a[aria-current="page"]')]
  check(activeLinks.length === 1 && activeLinks[0] === link('Usuários'), 'only Usuários must be active on /users')
  await wait(() => managementRequests === 1, 'ADMIN users query missing')
  const mountForm = (phone: string | null, scenario: string) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const store = createStore(); store.set(queryClientAtom, client)
    root.render(<Provider store={store}><ManagedUserForm key={scenario} mode="edit" user={{ ...user, phone }} onSuccess={() => {}} /></Provider>)
  }
  const createClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const createStoreForForm = createStore(); createStoreForForm.set(queryClientAtom, createClient)
  root.render(<Provider store={createStoreForForm}><ManagedUserForm mode="create" onSuccess={() => {}} /></Provider>)
  await wait(() => !!document.querySelector('input[name="phone"]') && input('firstName').value === '', 'create form not ready')
  fill('firstName', 'Nova'); fill('lastName', 'Pessoa'); fill('email', 'nova@example.com')
  fill('password', 'password123'); fill('confirmPassword', 'password123')
  submit('firstName')
  await wait(() => managedCreates.length === 1, 'creating without phone did not submit')
  check(managedCreates[0].data.phone === null, 'creating without phone must send null')
  mountForm(null, 'missing')
  await wait(() => !!document.querySelector('input[name="phone"]') && input('firstName').value === user.firstName, 'phone-less form not ready')
  fill('firstName', 'Atualizada')
  submit('firstName')
  await wait(() => managedUpdates.length === 1, 'editing without phone did not submit')
  check(managedUpdates[0].data.phone === null, 'editing without phone must send null')
  mountForm(user.phone, 'invalid')
  await wait(() => !!document.querySelector('input[name="phone"]') && input('phone').value.replace(/\D/g, '').includes('99999'), 'invalid phone form not ready')
  fill('phone', '+123')
  submit('firstName')
  await wait(() => !!input('phone').getAttribute('aria-invalid') && input('phone').getAttribute('aria-invalid') === 'true', 'invalid phone error missing')
  check(managedUpdates.length === 1, 'invalid phone submitted')
  mountForm(user.phone, 'existing')
  await wait(() => !!document.querySelector('input[name="phone"]') && input('phone').value.replace(/\D/g, '').includes('99999'), 'existing phone not displayed')
  fill('phone', '')
  submit('firstName')
  await wait(() => managedUpdates.length === 2, 'removing phone did not submit')
  check(managedUpdates[1].userId === user.id && managedUpdates[1].data.phone === null, 'removing phone must send null')
  document.body.textContent = 'ok'
}
main().catch(error => { document.body.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}` })
