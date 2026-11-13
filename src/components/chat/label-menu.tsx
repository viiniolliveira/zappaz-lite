import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Plus, Settings2, Tags } from 'lucide-react'
import { useEffect } from 'react'
import { chatLabelMutationAtom, chatLabelsAtom, manageChatLabelAtom } from '@/atoms/chat-labels'
import { chatLabelFilterAtom, chatLabelManagerAtom, chatSessionIdAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ChatConversation } from '@/lib/chat/types'

const checkboxClassName =
  'py-3 pl-3 pr-10 [&>span:first-child]:left-auto [&>span:first-child]:right-3 [&>span:first-child]:size-4 [&>span:first-child]:rounded [&>span:first-child]:border [&>span:first-child]:border-muted-foreground/60 data-[state=checked]:[&>span:first-child]:border-primary data-[state=checked]:[&>span:first-child]:bg-primary data-[state=checked]:[&>span:first-child]:text-primary-foreground'

export default function LabelMenu({ conversation }: { conversation?: ChatConversation }) {
  const labels = useAtomValue(chatLabelsAtom)
  const [filter, setFilter] = useAtom(chatLabelFilterAtom)
  const setManager = useSetAtom(chatLabelManagerAtom)
  const mutate = useSetAtom(manageChatLabelAtom)
  const pending = useAtomValue(chatLabelMutationAtom).isPending
  const sessionId = useAtomValue(chatSessionIdAtom)
  const selected =
    labels.data?.filter((label) =>
      conversation ? conversation.labelIds.includes(label.id) : label.id === filter,
    ) ?? []
  useEffect(() => {
    if (
      !conversation &&
      labels.isSuccess &&
      filter &&
      !labels.data.some((label) => label.id === filter)
    )
      setFilter(null)
  }, [conversation, labels.isSuccess, labels.data, filter, setFilter])
  const title = conversation
    ? selected.length > 1
      ? `${selected.length} selecionadas`
      : (selected[0]?.name ?? 'Adicionar etiquetas')
    : (selected[0]?.name ?? 'Etiquetas')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!sessionId}
          className="min-w-0 max-w-52"
          aria-label={conversation ? 'Editar etiquetas da conversa' : 'Filtrar por etiqueta'}
        >
          {selected.length ? (
            <span className="flex -space-x-1" aria-hidden="true">
              {selected.slice(0, 3).map((label) => (
                <span
                  key={label.id}
                  className="size-3 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: label.color }}
                />
              ))}
            </span>
          ) : (
            <Tags aria-hidden="true" className="size-3.5" />
          )}
          <span className="truncate">{title}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 p-2"
        aria-label={conversation ? 'Etiquetas da conversa' : 'Filtro de etiquetas'}
      >
        {labels.isPending ? (
          <p role="status" className="p-3 text-sm text-muted-foreground">
            Carregando etiquetas…
          </p>
        ) : labels.error ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              void labels.refetch()
            }}
          >
            Erro ao carregar. Tentar novamente
          </DropdownMenuItem>
        ) : conversation ? (
          <>
            {!labels.data?.length && (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma etiqueta criada.</p>
            )}
            {labels.data?.map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={conversation.labelIds.includes(label.id)}
                disabled={pending}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => {
                  void mutate({
                    action: 'link',
                    conversationId: conversation.id,
                    labelIds: checked
                      ? [...conversation.labelIds, label.id]
                      : conversation.labelIds.filter((id) => id !== label.id),
                  })
                }}
                className={checkboxClassName}
                title={label.description}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="truncate">{label.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : (
          <>
            <DropdownMenuCheckboxItem
              checked={!filter}
              onCheckedChange={() => setFilter(null)}
              className={checkboxClassName}
            >
              Todas as etiquetas
            </DropdownMenuCheckboxItem>
            {labels.data?.map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={filter === label.id}
                onCheckedChange={(checked) => setFilter(checked ? label.id : null)}
                className={checkboxClassName}
                title={label.description}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="truncate">{label.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="py-3" onClick={() => setManager('create')}>
          <Plus aria-hidden="true" />
          Criar etiqueta
        </DropdownMenuItem>
        <DropdownMenuItem className="py-3" onClick={() => setManager('list')}>
          <Settings2 aria-hidden="true" />
          Gerenciar etiquetas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
