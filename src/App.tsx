import { lazy, type ReactNode, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import { AdminLayout } from '@/layouts/admin-layout'
import { AuthLayout } from '@/layouts/auth-layout'
import { NotFoundPage } from '@/pages/not-found-page'
import SignInPage from '@/pages/sign-in-page'

const DashboardLayout = lazy(() =>
  import('@/layouts/dashboard-layout').then((module) => ({
    default: module.DashboardLayout,
  })),
)
const LogsPage = lazy(() => import('@/pages/logs-page'))
const ChatPage = lazy(() => import('@/pages/chat-page'))
const SessionDetailPage = lazy(() => import('@/pages/session-detail-page'))
const SessionsPage = lazy(() => import('@/pages/sessions-page'))
const SettingsPage = lazy(() => import('@/pages/settings-page'))
const ApiKeysPage = lazy(() => import('@/pages/api-keys-page'))
const UsersPage = lazy(() => import('@/pages/users-page'))
const UsePage = lazy(() => import('@/pages/use-page'))

function DashboardPageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-40 w-full items-center justify-center">
          <Spinner className="size-6 text-primary" aria-label="Carregando página" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sessions" replace />} />
      <Route element={<AuthLayout />}>
        <Route path="/sign-in" element={<SignInPage />} />
      </Route>
      <Route
        element={
          <DashboardPageSuspense>
            <DashboardLayout />
          </DashboardPageSuspense>
        }
      >
        <Route
          path="/sessions"
          element={
            <DashboardPageSuspense>
              <SessionsPage />
            </DashboardPageSuspense>
          }
        />
        <Route
          path="/sessions/:sessionId"
          element={
            <DashboardPageSuspense>
              <SessionDetailPage />
            </DashboardPageSuspense>
          }
        />
        <Route
          path="/logs"
          element={
            <DashboardPageSuspense>
              <LogsPage />
            </DashboardPageSuspense>
          }
        />
        <Route
          path="/chat"
          element={
            <DashboardPageSuspense>
              <ChatPage />
            </DashboardPageSuspense>
          }
        />
        <Route
          path="/use"
          element={
            <DashboardPageSuspense>
              <UsePage />
            </DashboardPageSuspense>
          }
        />
        <Route
          path="/account"
          element={
            <DashboardPageSuspense>
              <SettingsPage />
            </DashboardPageSuspense>
          }
        />
        <Route
          path="/api-keys"
          element={
            <DashboardPageSuspense>
              <ApiKeysPage />
            </DashboardPageSuspense>
          }
        />
        <Route element={<AdminLayout />}>
          <Route
            path="/users"
            element={
              <DashboardPageSuspense>
                <UsersPage />
              </DashboardPageSuspense>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
