import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

// Small "(?)" that opens a short explanation. Click, not hover: hover-only tooltips
// are unreachable on touch, and this text is the kind a reader needs to be able to
// keep open while re-reading the control it explains.
const WIDTH = 240
const MARGIN = 8

// `width` is for the long ones: the per-view "about" text runs two paragraphs, and at
// the control width it turns into a ribbon.
export default function HelpTip({ text, label, width = WIDTH }: { text: string; label?: string; width?: number }) {
  const { t } = useTranslation()
  // Fixed positioning, computed on open: the filter panel scrolls and clips its
  // overflow, so a popover anchored inside it gets cut off at the column edge.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const open = at !== null
  const ref = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setAt({
      top: r.bottom + 6,
      // Clamped to the viewport so it never hangs off either edge.
      left: Math.min(Math.max(MARGIN, r.left), window.innerWidth - width - MARGIN)
    })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      // The tip is portalled out of `ref`, so it needs its own containment check —
      // otherwise clicking the text you are reading closes it.
      if (ref.current?.contains(t) || tipRef.current?.contains(t)) return
      setAt(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null)
    // Scrolling the panel would leave the popover floating away from its (?).
    const close = () => setAt(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={e => {
          // The tip usually sits inside a <label>; without this, clicking it would
          // also toggle the control it is explaining.
          e.preventDefault()
          e.stopPropagation()
          if (open) setAt(null)
          else place()
        }}
        aria-expanded={open}
        aria-label={label ?? t('common.help')}
        className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold leading-none transition-colors ${
          open
            ? 'border-[#093b4d] bg-[#093b4d] text-white hover:border-brand-dark hover:bg-brand-dark'
            : 'border-gray-400 text-gray-500 hover:border-brand-dark hover:text-brand-dark'
        }`}
      >
        ?
      </button>
      {/* Portalled to <body>: `position: fixed` is only relative to the viewport while
          no ancestor has a transform, filter or backdrop-filter. The map's totals card
          uses backdrop-blur, which silently made it the containing block and threw the
          tip a few hundred px off. Coordinates are viewport-based, so the portal is
          the fix rather than more clamping. */}
      {at &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ top: at.top, left: at.left, width }}
            className="fixed z-[1200] block space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-[11px] font-normal leading-relaxed text-gray-600 shadow-lg"
          >
            {/* Newlines are paragraph breaks: these tips run to two beats — what the
                thing is, then what the control does with it. */}
            {text.split('\n').filter(Boolean).map((p, i) => (
              <span key={i} className="block">
                {p}
              </span>
            ))}
          </span>,
          document.body
        )}
    </span>
  )
}
