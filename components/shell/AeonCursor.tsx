'use client'

import { useEffect, useRef } from 'react'

export default function AeonCursor() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const mouse = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let outerX = 0
    let outerY = 0

    const onMove = (event: MouseEvent) => {
      mouse.current = { x: event.clientX, y: event.clientY }
    }

    const tick = () => {
      outerX += (mouse.current.x - outerX) * 0.12
      outerY += (mouse.current.y - outerY) * 0.12

      if (outerRef.current) {
        outerRef.current.style.left = `${outerX}px`
        outerRef.current.style.top = `${outerY}px`
      }

      if (innerRef.current) {
        innerRef.current.style.left = `${mouse.current.x}px`
        innerRef.current.style.top = `${mouse.current.y}px`
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove)
    rafRef.current = requestAnimationFrame(tick)
    document.body.classList.add('aeon-custom-cursor')

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
      document.body.classList.remove('aeon-custom-cursor')
    }
  }, [])

  return (
    <>
      <div
        ref={outerRef}
        style={{
          position: 'fixed',
          width: 28,
          height: 28,
          transform: 'translate(-50%, -50%)',
          border: '1px solid rgba(0, 229, 255, 0.7)',
          clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
          pointerEvents: 'none',
          zIndex: 99999,
        }}
      />
      <div
        ref={innerRef}
        style={{
          position: 'fixed',
          width: 4,
          height: 4,
          transform: 'translate(-50%, -50%)',
          background: '#00e5ff',
          borderRadius: '50%',
          boxShadow: '0 0 6px #00e5ff',
          pointerEvents: 'none',
          zIndex: 99999,
        }}
      />
    </>
  )
}