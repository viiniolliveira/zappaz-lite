export default function TypingBubble({ displayName }: { displayName: string }) {
  return (
    <div
      role="status"
      aria-label={`${displayName} está digitando`}
      className="mt-3 flex justify-start"
    >
      <div
        data-slot="typing-bubble"
        aria-hidden="true"
        className="flex h-10 items-center gap-1 rounded-xl rounded-tl-sm border bg-background px-4 shadow-sm"
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-[typing-wave_1.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
