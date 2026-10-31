'use client'
import { useDemoMode } from '@/lib/demo-mode-context'

export function DemoModeToggle() {
  const { demoMode, toggleDemoMode } = useDemoMode()
  return (
    <button
      onClick={toggleDemoMode}
      className={`w-full text-sm px-3 py-2 rounded-md font-medium transition-colors ${
        demoMode
          ? 'bg-[#00d4aa] text-[#0f2318]'
          : 'bg-[#0f2318] text-[#00d4aa] border border-[#00d4aa]/40 hover:border-[#00d4aa]'
      }`}
    >
      {demoMode ? '● Demo Mode ON' : '○ Demo Mode'}
    </button>
  )
}
