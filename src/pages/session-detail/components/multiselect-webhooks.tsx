'use client'

import { useEffect, useState } from 'react'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'

type Option = { value: string; label: string }

export const webhookEvents: Option[] = [
  { value: 'blocklist.set', label: 'Blocklist Set' },
  { value: 'blocklist.update', label: 'Blocklist Update' },
  { value: 'call', label: 'Call' },
  { value: 'chats.delete', label: 'Chats Delete' },
  { value: 'chats.phoneNumberShare', label: 'Chats Phone Number Share' },
  { value: 'chats.update', label: 'Chats Update' },
  { value: 'chats.upsert', label: 'Chats Upsert' },
  { value: 'connection.update', label: 'Connection Update' },
  { value: 'contacts.update', label: 'Contacts Update' },
  { value: 'contacts.upsert', label: 'Contacts Upsert' },
  { value: 'group-participants.update', label: 'Group Participants Update' },
  { value: 'group.join-request', label: 'Group Join Request' },
  { value: 'groups.update', label: 'Groups Update' },
  { value: 'groups.upsert', label: 'Groups Upsert' },
  { value: 'inbound-message.upsert', label: 'Inbound Message Upsert' },
  { value: 'labels.association', label: 'Labels Association' },
  { value: 'labels.edit', label: 'Labels Edit' },
  { value: 'message-receipt.update', label: 'Message Receipt Update' },
  { value: 'messages.delete', label: 'Messages Delete' },
  { value: 'messages.media-update', label: 'Messages Media Update' },
  { value: 'messages.reaction', label: 'Messages Reaction' },
  { value: 'messages.send', label: 'Messages Send' },
  { value: 'messages.update', label: 'Messages Update' },
  { value: 'messaging-history.set', label: 'Messaging History Set' },
  { value: 'outbound-message.upsert', label: 'Outbound Message Upsert' },
  { value: 'presence.update', label: 'Presence Update' },
]

interface MultiSelectWebhookProps {
  selectedEvents: Option[]
  setSelectedEvents: (events: Option[]) => void
}

export default function MultiSelectWebhook({
  selectedEvents,
  setSelectedEvents,
}: MultiSelectWebhookProps) {
  const anchor = useComboboxAnchor()
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setPortalContainer(anchor.current?.closest<HTMLElement>('[role="dialog"]') ?? null)
  }, [anchor])
  return (
    <Combobox
      multiple
      autoHighlight
      items={webhookEvents.map((event) => event.value)}
      value={selectedEvents.map((event) => event.value)}
      onValueChange={(values) =>
        setSelectedEvents(
          values.map(
            (value) =>
              webhookEvents.find((event) => event.value === value) ?? { value, label: value },
          ),
        )
      }
      itemToStringLabel={(value) =>
        webhookEvents.find((event) => event.value === value)?.label ?? value
      }
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: string[]) => (
            <>
              {values.map((value) => (
                <ComboboxChip key={value}>
                  {webhookEvents.find((event) => event.value === value)?.label ?? value}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label="Selecione os eventos do webhook"
                placeholder={values.length ? '' : 'Selecione os eventos do webhook'}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor} portalContainer={portalContainer}>
        <ComboboxEmpty>Nenhum resultado encontrado</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {webhookEvents.find((event) => event.value === item)?.label ?? item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
