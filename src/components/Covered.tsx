import { EyeOff } from 'lucide-react'
import { useState } from 'react'

/** Content behind a warning: a note and a Show button until asked for. */
export function Covered({ warning, children, className }: { warning?: string; children: React.ReactNode; className?: string }) {
  const [shown, setShown] = useState(false)
  if (!warning || shown) return <>{children}</>
  return (
    <div className={`covered ${className ?? ''}`}>
      <EyeOff size={15} className="flex-none text-ink-3" />
      <span className="min-w-0 flex-1 text-[0.875rem] text-ink-2">{warning}</span>
      <button type="button" className="btn h-8 flex-none px-3 text-[0.8125rem]" onClick={() => setShown(true)}>
        Show
      </button>
    </div>
  )
}
