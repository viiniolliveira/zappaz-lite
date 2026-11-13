import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { Toaster } from '../../src/components/ui/sonner'

createRoot(document.getElementById('root')!).render(createElement(Toaster, { expand: true }))
setTimeout(() => {
  toast.success('Histórico sincronizado', { duration: Infinity })
  toast.warning('WhatsApp desconectado', { duration: Infinity })
  toast.error('Erro ao carregar histórico', { duration: Infinity })
}, 100)
setTimeout(() => {
  const colors = ['success', 'warning', 'error'].map(type => {
    const notice = document.querySelector<HTMLElement>(`[data-sonner-toast][data-type="${type}"]`)
    if (!notice) return { type, missing: true }
    const style = getComputedStyle(notice)
    const rect = notice.getBoundingClientRect()
    return { type, rich: notice.dataset.richColors, opacity: Number(style.opacity), width: rect.width, height: rect.height, x: rect.x, y: rect.y, background: style.backgroundColor, normal: style.getPropertyValue('--normal-bg').trim(), display: style.display, visibility: style.visibility }
  })
  document.body.dataset.viewport = `${window.innerWidth},${window.innerHeight}`
  document.body.dataset.css = getComputedStyle(document.documentElement).getPropertyValue('--popover').trim() ? 'loaded' : 'missing'
  document.body.dataset.result = JSON.stringify(colors)
}, 1000)
