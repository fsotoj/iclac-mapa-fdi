import { useEffect, useRef, useState } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Maps a route to its "about" i18n namespace. Routes not listed hide the button.
const ROUTE_KEY: Record<string, string> = {
  '/': 'map',
  '/sankey': 'sankey'
}

export default function AboutPanel() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const key = ROUTE_KEY[pathname]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on route change so stale context text never lingers.
  useEffect(() => setOpen(false), [pathname])

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

  if (!key) return null

  const paragraphs = t(`about.${key}.body`).split('\n').filter(Boolean)

  return (
    <>
      {/* Leading divider lives here (not in Layout) so it vanishes with the button
          on routes that have no "about" text — no orphan separator. */}
      <span className="h-5 w-px bg-gray-300" aria-hidden />
      <div ref={ref} className="relative">
        <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1 text-sm ${open ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 11v5" />
          <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        {t('about.label')}
      </button>

      {open && (
        <div className="absolute right-0 z-[1001] mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          <h3 className="mb-2 text-sm font-semibold text-[#093b4d]">{t(`about.${key}.title`)}</h3>
          <div className="space-y-2 text-[13px] leading-relaxed text-gray-600">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3 text-xs">
            <NavLink to="/methodology" className="font-medium text-[#377F83] hover:underline">
              {t('nav.methodology')}
            </NavLink>
            <NavLink to="/downloads" className="font-medium text-[#377F83] hover:underline">
              {t('nav.downloads')}
            </NavLink>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
