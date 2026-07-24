import { useEffect, useRef, useState } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Maps a route to its "about" i18n namespace. Routes not listed hide the button.
const ROUTE_KEY: Record<string, string> = {
  '/': 'map',
  '/sankey': 'sankey'
}

// Auto-open is once per browser, ever — not once per session. Re-opening on every
// visit would read as a nag on a tool people come back to.
const SEEN_KEY = 'iclac.about.seen'

// Memoised per page load, deliberately outside React: StrictMode double-invokes both
// effects and state initialisers in dev, so an un-memoised read+write would burn the
// flag on the first pass and answer "already seen" on the second — panel never opens.
let firstVisit: boolean | null = null
const consumeFirstVisit = () => {
  if (firstVisit === null) {
    try {
      firstVisit = !localStorage.getItem(SEEN_KEY)
      if (firstVisit) localStorage.setItem(SEEN_KEY, '1')
    } catch {
      firstVisit = false // storage blocked (private mode): never auto-open
    }
  }
  return firstVisit
}

export default function AboutPanel() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const key = ROUTE_KEY[pathname]
  // Opens itself on a first-ever visit — an icon alone rarely gets clicked, and the
  // context text is the thing worth seeing. Resolved at mount rather than in an effect
  // so nothing can close it before it paints. Guarded on `key` so landing straight on
  // Methodology or Contact does not silently spend the one-time open.
  const [open, setOpen] = useState(() => !!ROUTE_KEY[pathname] && consumeFirstVisit())
  const ref = useRef<HTMLDivElement>(null)

  // Close on route change so stale context text never lingers. Compares against the
  // last path instead of firing on mount, which would undo the first-visit open.
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    setOpen(false)
  }, [pathname])

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
  // Only the map carries the published citation; sankey has none.
  const citationKey = `about.${key}.citation`
  const citation = i18n.exists(citationKey) ? t(citationKey) : null

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Icon-only, in the brand green rather than the nav's gray: beside the title a
          gray icon+label reads as a nav link that drifted off the cluster. Colour is
          what marks it clickable, and it adds no box to an already busy header. */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={t('about.label')}
        title={t('about.label')}
        className={`flex items-center rounded-full transition-colors ${open ? 'text-[#093b4d]' : 'text-[#377F83] hover:text-[#093b4d]'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
          {/* Open state fills the disc so the trigger reads as "active", not just hovered. */}
          <circle cx="12" cy="12" r="9" fill={open ? 'currentColor' : 'none'} />
          <path strokeLinecap="round" stroke={open ? '#fff' : 'currentColor'} d="M12 11v5" />
          <circle cx="12" cy="7.6" r="0.7" fill={open ? '#fff' : 'currentColor'} stroke="none" />
        </svg>
      </button>

      {/* Anchored under the button on desktop. On mobile the button sits mid-header,
          so anchoring there pushes the panel off-screen: pin it to the viewport instead. */}
      {open && (
        <div className="fixed inset-x-2 top-[3.75rem] z-[1001] max-h-[75vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-lg sm:max-h-[80vh] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)]">
          <h3 className="mb-2 text-sm font-semibold text-[#093b4d]">{t(`about.${key}.title`)}</h3>
          <div className="space-y-2 text-[13px] leading-relaxed text-gray-600">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {citation && (
            <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">{citation}</p>
          )}
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
  )
}
