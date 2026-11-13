'use client'

import type React from 'react'
import { useRef, useState } from 'react'

export function useResizableDrawer() {
  const [height, setHeight] = useState(
    typeof window !== 'undefined' ? Math.min(1000, window.innerHeight * 0.9) : 800,
  )
  const startYRef = useRef(0)
  const startHRef = useRef(0)

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    startYRef.current = e.clientY
    startHRef.current = height

    function onMouseMove(ev: MouseEvent) {
      const delta = startYRef.current - ev.clientY
      const newH = Math.max(100, Math.min(window.innerHeight, startHRef.current + delta))
      setHeight(newH)
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return {
    height,
    onResizeStart,
  }
}
