'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type DemoModeContextType = { demoMode: boolean; toggleDemoMode: () => void }
const DemoModeContext = createContext<DemoModeContextType>({ demoMode: true, toggleDemoMode: () => {} })

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoMode] = useState(true)
  return (
    <DemoModeContext.Provider value={{ demoMode, toggleDemoMode: () => setDemoMode(p => !p) }}>
      {children}
    </DemoModeContext.Provider>
  )
}

export const useDemoMode = () => useContext(DemoModeContext)
