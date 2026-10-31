'use client'
import { ReactNode } from 'react'
import { useDemoMode } from '@/lib/demo-mode-context'

export function BlurField({ children }: { children: ReactNode }) {
  const { demoMode } = useDemoMode()
  return (
    <span style={{
      filter: demoMode ? 'blur(6px)' : 'none',
      userSelect: demoMode ? 'none' : 'auto',
      transition: 'filter 0.2s ease',
      display: 'inline-block',
    }}>
      {children}
    </span>
  )
}

// Blurs a whole section (lists, rows, counts) in Demo Mode, for places where
// wrapping each individual field in BlurField would miss something. Also
// makes it non-interactive while blurred — no clicks (pointer-events) and no
// keyboard focus (inert) — so a blurred row can't open the real, unblurred
// record.
export function BlurBlock({ children }: { children: ReactNode }) {
  const { demoMode } = useDemoMode()
  return (
    <div inert={demoMode} style={{
      filter: demoMode ? 'blur(6px)' : 'none',
      userSelect: demoMode ? 'none' : 'auto',
      pointerEvents: demoMode ? 'none' : 'auto',
      transition: 'filter 0.2s ease',
    }}>
      {children}
    </div>
  )
}
