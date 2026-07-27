import { useState, type ReactNode } from 'react'

// Sidebar collapsible section. Starts collapsed; the header carries a summary of
// the current state ("Todos" / "3 seleccionados") so the collapsed row is both
// informative and clearly expandable — the affordance the old ad-hoc pattern lacked.
export default function CollapsibleSection({
  label,
  summary,
  defaultOpen = false,
  children
}: {
  label: string
  summary: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-brand hover:text-gray-900"
      >
        <span className="shrink-0 text-xs font-medium text-gray-600">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-gray-400">{summary}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </section>
  )
}
