'use client'

import { useAtom } from 'jotai'
import { Webhook as WebhookIcon } from 'lucide-react'
import { createWebhookModalOpenAtom, getWebhooksAtom } from '@/atoms/webhook'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { SessionSchema, Webhook } from '@/services/types'
import WebhookCard from './webhook-card'
import { CreateWebhookModal, DeleteWebhookModal, EditWebhookModal } from './webhook-modals'

export default function SessionWebhooks({ session }: { session: SessionSchema }) {
  const [, setOpenModal] = useAtom(createWebhookModalOpenAtom)
  const [{ data: response, isPending, isError, refetch }] = useAtom(getWebhooksAtom(session.id))

  const webhooks = Array.isArray(response?.data) ? response.data : []

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Webhooks</h2>
          <p className="text-xs text-muted-foreground">
            Envie os eventos desta sessão para sua aplicação.
          </p>
        </div>
        {webhooks.length > 0 && (
          <div className="grid self-end">
            <Button onClick={() => setOpenModal(true)} className="ml-auto" variant="outline">
              <span className="flex items-center gap-2">
                <WebhookIcon className="inline-block" size={16} aria-hidden="true" />
                Criar Webhook
              </span>
            </Button>
          </div>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2 items-center justify-center h-full w-full">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 text-sm">
          <p>Não foi possível carregar os webhooks.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 mt-6 w-full">
          {webhooks.length > 0 ? (
            webhooks.map((webhook: Webhook) => (
              <WebhookCard key={webhook.id} webhook={webhook} sessionId={session.id} />
            ))
          ) : (
            <div className="flex w-full flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <WebhookIcon className="size-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold">Conecte sua aplicação aos eventos</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Nenhum webhook configurado. Receba mensagens, mudanças de conexão e outros eventos
                em uma URL da sua aplicação.
              </p>
              <Button className="mt-5" onClick={() => setOpenModal(true)}>
                <WebhookIcon aria-hidden="true" />
                Criar primeiro webhook
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Render modals here so they are in the DOM and scoped to this session */}
      <CreateWebhookModal sessionId={session.id} />
      <EditWebhookModal sessionId={session.id} />
      <DeleteWebhookModal sessionId={session.id} />
    </div>
  )
}
