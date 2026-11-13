import { List, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MessageDTO } from '@/lib/chat/schemas'

type MessageListData = NonNullable<NonNullable<MessageDTO['interactive']>['list']>

export default function MessageList({
  list,
  disabled,
  onSelect,
}: {
  list: MessageListData
  disabled: boolean
  onSelect: (text: string) => void
}) {
  return (
    <details data-slot="message-list" className="border-t border-foreground/10">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 px-3 py-2 text-primary focus-visible:outline-2 focus-visible:outline-ring">
        <List className="size-4" aria-hidden="true" />
        {list.buttonText}
      </summary>
      <div className="max-h-80 space-y-2 overflow-y-auto border-t border-foreground/10 p-2">
        {list.sections.map((section) => (
          <section key={JSON.stringify(section)} aria-label={section.title ?? 'Opções'}>
            {section.title && (
              <h4 className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                {section.title}
              </h4>
            )}
            {section.rows.map((row) => (
              <Button
                key={`${row.id}-${row.title}`}
                type="button"
                variant="ghost"
                className="h-auto min-h-10 w-full justify-start gap-3 whitespace-normal text-left"
                disabled={disabled || !row.title.trim()}
                onClick={() => onSelect(row.title)}
                title="Enviar esta opção como resposta em texto"
              >
                <span className="min-w-0 flex-1 break-words">
                  <span className="block">{row.title}</span>
                  {row.description && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {row.description}
                    </span>
                  )}
                </span>
                <Send className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Button>
            ))}
          </section>
        ))}
        <p className="px-2 text-xs text-muted-foreground">
          A opção será enviada como texto, citando esta mensagem.
        </p>
      </div>
    </details>
  )
}
