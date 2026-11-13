import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../src/components/ui/tooltip'

const params = new URLSearchParams(location.search)
const side = params.get('side') as 'top' | 'right' | 'bottom' | 'left'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')

function Fixture() {
  useEffect(() => {
    setTimeout(() => {
      const trigger = document.querySelector<HTMLButtonElement>('button')
      const content = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')
      const arrow = content?.querySelector<SVGElement>('svg')
      if (!trigger || !content || !arrow) throw new Error('Tooltip fixture did not render')
      const label = document.getElementById(trigger.getAttribute('aria-describedby') || '')
      const rect = arrow.getBoundingClientRect()
      document.body.dataset.result = JSON.stringify({
        side: content.dataset.side,
        fill: getComputedStyle(arrow).fill,
        background: getComputedStyle(content).backgroundColor,
        arrowBackground: getComputedStyle(arrow).backgroundColor,
        transform: getComputedStyle(arrow).transform,
        viewBox: arrow.getAttribute('viewBox'),
        width: arrow.getAttribute('width'),
        height: arrow.getAttribute('height'),
        rectWidth: rect.width,
        rectHeight: rect.height,
        label: label?.textContent,
        role: label?.getAttribute('role'),
        portaled: !document.getElementById('root')?.contains(content),
      })
    }, 500)
  }, [])
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>Botão</TooltipTrigger>
        <TooltipContent side={side}>Descrição acessível</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing fixture root')
createRoot(root).render(<Fixture />)
