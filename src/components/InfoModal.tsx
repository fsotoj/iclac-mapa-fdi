import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

// Shell shared by the three panels that interrupt the view: the trilingual presentation
// and the two per-tool explanations. Only the shell is shared — what goes inside differs
// enough (three columns vs one, decorated vs plain) that a single component would be a
// pile of flags.
export default function InfoModal({
  open,
  onClose,
  label,
  panelClass = 'max-w-2xl bg-white',
  children
}: {
  open: boolean
  onClose: () => void
  label: string
  panelClass?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreTo = useRef<Element | null>(null)
  // Through a ref so the effect can keep `[open]` as its only dependency: an inline
  // onClose changes identity every render, and re-running would steal focus each time.
  const closeCb = useRef(onClose)
  closeCb.current = onClose

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCb.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (restoreTo.current instanceof HTMLElement) restoreTo.current.focus()
    }
  }, [open])

  if (!open) return null

  // Portalled to <body> for the same reason as HelpTip: `fixed inset-0` only means the
  // viewport while no ancestor has transform/filter/backdrop-filter. The map's trigger
  // lives inside the totals card, which uses backdrop-blur — without this the whole
  // dialog is trapped inside that little box.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3 sm:p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`relative max-h-[92vh] w-full overflow-y-auto rounded-lg shadow-2xl ${panelClass}`}>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-500 hover:bg-brand hover:text-gray-900"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body
  )
}
