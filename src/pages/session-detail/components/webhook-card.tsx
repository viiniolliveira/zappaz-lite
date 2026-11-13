'use client'

import { useAtom } from 'jotai'
import { SquarePen, Trash2 } from 'lucide-react'
import {
  deleteWebhookModalOpenAtom,
  editWebhookModalOpenAtom,
  selectedWebhookAtom,
  updateWebhookAtom,
} from '@/atoms/webhook'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Webhook } from '@/services/types'

export default function WebhookCard({
  webhook,
  sessionId,
}: {
  webhook: Webhook
  sessionId: string
}) {
  const [{ isPending: loading, mutate: updateWebhook }] = useAtom(updateWebhookAtom)
  const [, setEditWebhookModalOpen] = useAtom(editWebhookModalOpenAtom)
  const [, setDeleteWebhookModalOpen] = useAtom(deleteWebhookModalOpenAtom)
  const [, setSelectedWebhook] = useAtom(selectedWebhookAtom)

  if (!webhook) return null

  const handleOpenEditModal = () => {
    setSelectedWebhook(webhook)
    setEditWebhookModalOpen(true)
  }

  const handleOpenDeleteModal = () => {
    setSelectedWebhook(webhook)
    setDeleteWebhookModalOpen(true)
  }

  const handleToggleEnabled = async (checked: boolean) => {
    let events: string[] = []
    if (Array.isArray(webhook.events)) {
      events = webhook.events
    } else if (webhook.events) {
      events = Object.entries(webhook.events)
        .filter(([, enabled]) => enabled === true)
        .map(([event]) => event)
    }
    updateWebhook({
      sessionId: sessionId,
      webhookId: webhook.id,
      req: {
        enabled: checked,
        displayName: webhook.displayName,
        url: webhook.url,
        headers: webhook.headers || undefined,
        events: events,
      },
    })
  }

  return (
    <div className="bg-card border min-h-12 w-full rounded-lg flex flex-wrap justify-between items-center gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-1 gap-3 items-center">
        <span
          role="img"
          aria-label={webhook.enabled ? 'Ativo' : 'Inativo'}
          className="flex shrink-0 justify-center text-center items-center h-5 w-5 relative"
        >
          <span
            className={`animate-ping h-3 w-3 rounded-full absolute inset-0 m-auto ${
              webhook?.enabled ? 'bg-green-400' : 'bg-red-400'
            } opacity-75`}
          ></span>
          <span
            className={`rounded-full h-3 w-3 absolute inset-0 m-auto ${
              webhook?.enabled ? 'bg-green-500' : 'bg-red-500'
            }`}
          ></span>
        </span>
        <h3 className="truncate font-medium text-sm" title={webhook.displayName}>
          {webhook?.displayName}
        </h3>
      </div>
      <div className="flex gap-2 items-center">
        <Switch
          aria-label={`Ativar ${webhook.displayName}`}
          className="cursor-pointer"
          onCheckedChange={handleToggleEnabled}
          disabled={loading}
          checked={webhook?.enabled}
        />
        <Button
          aria-label={`Excluir ${webhook.displayName}`}
          onClick={handleOpenDeleteModal}
          variant="ghost"
          size={'icon'}
          className="h-8 w-8"
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          aria-label={`Editar ${webhook.displayName}`}
          onClick={handleOpenEditModal}
          variant="ghost"
          size={'icon'}
          className="h-8 w-8"
        >
          <SquarePen className="size-4" />
        </Button>
      </div>
    </div>
  )
}
