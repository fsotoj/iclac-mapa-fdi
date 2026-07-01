import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  label: string
  count?: number
  children: ReactNode
}

// Popover multiselect trigger. Closes on outside click / Escape.
export default function FilterDropdown({ label, count = 0, children }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = count > 0
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs ${
          active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {label}
        {active && <span className="rounded-full bg-white/25 px-1.5 leading-tight">{count}</span>}
        <span className="text-[9px] opacity-70">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}
