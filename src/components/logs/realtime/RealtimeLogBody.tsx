'use client'

import { Check, ClipboardList } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { JsonPreview } from '../JsonPreview'

interface RealtimeLogDataProps {
  data: unknown
}

interface ResizableLogsBodyProps {
  payload: unknown
  response: unknown
}

export function CopyButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data))
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  return (
    <button type="button" onClick={handleCopy}>
      {copied ? (
        <Check className="size-4 text-ring" />
      ) : (
        <ClipboardList className="size-4 text-foreground" />
      )}
    </button>
  )
}

export function RealtimeLogData({ data }: RealtimeLogDataProps) {
  const { theme } = useTheme()
  const bgColor = theme === 'dark' ? 'bg-[#1E1E1E]' : 'bg-background'

  return (
    <div
      className={`flex-1 min-h-0 min-w-0 overflow-auto overscroll-contain border border-border rounded-b-md ${bgColor}`}
    >
      <div className="min-w-max">
        <JsonPreview data={data} />
      </div>
    </div>
  )
}

export default function ResizableLogsBody({ payload, response }: ResizableLogsBodyProps) {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 w-full overflow-hidden rounded-md gap-3"
    >
      <ResizablePanel
        defaultSize={50}
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-md"
      >
        <div className="sticky top-0 z-10 shrink-0 p-2 bg-card border flex justify-between w-full rounded-t-md">
          <p className="text-sm">Payload</p>
          <CopyButton data={payload} />
        </div>
        <RealtimeLogData data={payload} />
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className="bo"
        onPointerDownCapture={(event) => event.stopPropagation()}
      />
      <ResizablePanel
        defaultSize={50}
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-md"
      >
        <div className="sticky top-0 z-10 shrink-0 p-2 bg-card border flex justify-between w-full rounded-t-md">
          <p className="text-sm">Response</p>
          <CopyButton data={response} />
        </div>
        <RealtimeLogData data={response} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
