import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

// Panel que sube desde el borde inferior, para lo que en escritorio es una caja
// flotante o un popover: la leyenda de sectores y los filtros de Tendencias. En una
// pantalla de 360×640 esas dos cosas tapaban entre el 15% y el 30% del gráfico, y en
// touch el pulgar llega antes abajo que arriba.
//
// Portalizado a <body> por la misma razón que HelpTip e InfoModal: `fixed` sólo es
// relativo al viewport si ningún ancestro tiene transform/filter/backdrop-filter, y
// la caja de totales del mapa usa backdrop-blur.
export default function BottomSheet({
  open,
  onClose,
  title,
  children
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreTo = useRef<Element | null>(null)
  // Por ref para que el efecto dependa sólo de `open`: un onClose inline cambia de
  // identidad en cada render y volvería a robar el foco.
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[2000] flex flex-col justify-end bg-black/40"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-brand hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
