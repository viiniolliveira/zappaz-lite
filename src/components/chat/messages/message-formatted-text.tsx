import { parseWhatsAppText, type WhatsAppTextPart } from '@shared/whatsapp-format'

export default function MessageFormattedText({
  text,
  links = true,
}: {
  text: string
  links?: boolean
}) {
  return (
    <>
      {parseWhatsAppText(text).map((part) => (
        <FormattedPart key={part.offset} part={part} links={links} />
      ))}
    </>
  )
}

function FormattedPart({ part, links }: { part: WhatsAppTextPart; links: boolean }) {
  switch (part.kind) {
    case 'text':
      return part.value
    case 'code':
      return (
        <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-[0.9em] whitespace-pre-wrap">
          {part.value}
        </code>
      )
    case 'link':
      return links ? (
        <a
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline decoration-primary underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {part.value}
        </a>
      ) : (
        part.value
      )
    default: {
      const Tag = part.kind
      return (
        <Tag>
          {part.children.map((child) => (
            <FormattedPart key={child.offset} part={child} links={links} />
          ))}
        </Tag>
      )
    }
  }
}
