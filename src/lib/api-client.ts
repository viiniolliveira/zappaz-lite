import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { ApiError } from './api-error'

export const API_URL = ''

interface RequestOptions {
  method?: AxiosRequestConfig['method']
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
  headers?: AxiosRequestConfig['headers']
  authenticated?: boolean
  signal?: AbortSignal
  responseType?: AxiosRequestConfig['responseType']
}

interface ErrorPayload {
  ok?: boolean
  error?:
    | {
        code?: string
        message?: string
      }
    | string
  message?: string
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorPayload>) => {
    const status = error.response?.status ?? 0
    const payload = error.response?.data
    const message =
      (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ??
      payload?.message ??
      error.message ??
      'Erro ao comunicar com a API'

    return Promise.reject(new ApiError(message, status, payload))
  },
)

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await api.request<T>({
    url: path,
    method: options.method ?? 'GET',
    data: options.body,
    params: options.params,
    headers: options.headers,
    signal: options.signal,
    responseType: options.responseType,
  })

  return response.data
}
