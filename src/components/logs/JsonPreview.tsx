import JsonView from '@uiw/react-json-view'
import { githubLightTheme } from '@uiw/react-json-view/githubLight'
import { vscodeTheme } from '@uiw/react-json-view/vscode'
import { useTheme } from 'next-themes'

import type { CSSProperties } from 'react'

type JsonPreviewProps = {
  data: unknown
}

function parseResponse(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function JsonPreview({ data }: JsonPreviewProps) {
  const { theme } = useTheme()
  const jsonViewTheme = theme === 'dark' ? vscodeTheme : githubLightTheme

  const parsedData = parseResponse(data)

  if (typeof parsedData === 'string') {
    return (
      <pre className="whitespace-pre-wrap wrap-break-word p-4 font-mono text-sm">{parsedData}</pre>
    )
  }

  if (typeof parsedData !== 'object' || parsedData === null) {
    return (
      <pre className="whitespace-pre-wrap wrap-break-word p-4 font-mono text-sm">
        {String(parsedData)}
      </pre>
    )
  }

  return (
    <JsonView
      value={parsedData}
      style={jsonViewTheme as CSSProperties}
      displayDataTypes={false}
      enableClipboard
      shortenTextAfterLength={50}
    />
  )
}
