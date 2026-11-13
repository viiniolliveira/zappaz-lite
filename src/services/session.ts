import { request } from '@/lib/api-client'
import type {
  ConfigSessionSchema,
  ConnectSession,
  CreateSessionRequest,
  SendMessageHistoryResponse,
  SessionSchema,
  UpdateSessionRequest,
} from './types'

export const DEFAULT_SESSION_CONFIG: Readonly<ConfigSessionSchema> = {
  signatureEnabled: false,
  signatureName: '',
  messageOnCall: '',
  rejectCalls: false,
  ignoreGroups: false,
  markOnlineOnConnect: false,
  syncFullHistory: false,
}

export function createSession(req: CreateSessionRequest) {
  return request<SessionSchema>('/api/v1/session', {
    method: 'POST',
    body: {
      displayName: req.displayName,
      config: { ...DEFAULT_SESSION_CONFIG, ...req.config },
    },
  })
}

export function getSessions() {
  return request<{ data: SessionSchema[] }>('/api/v1/session')
}

export function getSessionById(sessionId: string) {
  return request<SessionSchema>(`/api/v1/session/${sessionId}`)
}

export function connectSession(sessionId: string) {
  return request<ConnectSession>(`/api/v1/session/${sessionId}/connect`, {
    method: 'POST',
    body: {},
  })
}

export function logoutSession(sessionId: string) {
  return request(`/api/v1/session/${sessionId}/logout`, { method: 'PUT', body: {} })
}

export function updateSession(sessionId: string, req: UpdateSessionRequest) {
  return request<SessionSchema>(`/api/v1/session/${sessionId}`, { method: 'PUT', body: req })
}

export function removeSession(sessionId: string) {
  return request(`/api/v1/session/${sessionId}/remove`, { method: 'DELETE' })
}

export function getSendMessageHistory(
  sessionId: string,
  granularity = 'day',
  startDate?: string,
  endDate?: string,
) {
  return request<SendMessageHistoryResponse>(`/api/v1/session/${sessionId}/send-message-history`, {
    params: { granularity, startDate, endDate },
  })
}
