import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LocaleCode } from '@/types/data'
import Footer from './Footer'
import AboutPanel from './AboutPanel'

const LANGS: { code: LocaleCode; label: string }[] = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
  { code: 'cn', label: '中文' }
]

// dataView routes share filter state via the URL query string (useFilters) —
// switching between them must preserve it, or filters silently reset to default.
const NAV: { to: string; end?: boolean; key: string; dataView?: boolean }[] = [
  { to: '/', end: true, key: 'nav.map', dataView: true },
  { to: '/sankey', key: 'nav.sankey', dataView: true },
  { to: '/methodology', key: 'nav.methodology' },
  { to: '/downloads', key: 'nav.downloads' },
  { to: '/contact', key: 'nav.contact' }
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900'

export default function Layout() {
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname, search } = useLocation()

  // Close the mobile menu on navigation so it never lingers over the new view.
  useEffect(() => setMenuOpen(false), [pathname])

  const langButtons = (
    <div className="flex gap-1 text-sm">
      {LANGS.map(l => (
        <button
          key={l.code}
          onClick={() => i18n.changeLanguage(l.code)}
          className={`px-2 py-1 rounded ${i18n.language === l.code ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="relative z-[1000] border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a href="https://iclac.cl/" target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img src="/icons/iclac.webp" alt="ICLAC" className="h-9 sm:h-10 w-auto object-contain" />
            </a>
            <div className="leading-tight min-w-0">
              <h1 className="text-[13px] font-semibold leading-tight text-gray-900 sm:text-base">{t('app.subject')}</h1>
              <p className="hidden text-xs text-gray-500 sm:block sm:truncate">{t('app.kind')}</p>
            </div>
            {/* Contextual "About" belongs beside the title, not in the nav cluster
                (Margaret UAT): it describes what you are looking at, not where to go.
                Sibling of the title block, so the row's items-center centres it on the
                header height rather than on the title's own line. */}
            <AboutPanel />
          </div>

          {/* Desktop cluster: full nav + contextual About + language switch. */}
          <div className="hidden md:flex items-center gap-4 shrink-0">
            <nav className="flex gap-4 text-sm">
              {NAV.map(n => (
                <NavLink
                  key={n.to}
                  to={n.dataView ? { pathname: n.to, search } : n.to}
                  end={n.end}
                  className={navLinkClass}
                >
                  {t(n.key)}
                </NavLink>
              ))}
            </nav>
            <span className="h-5 w-px bg-gray-300" aria-hidden />
            {langButtons}
          </div>

          {/* Mobile: hamburger toggles a stacked menu below the header row. */}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t('common.close') : t('nav.menu')}
            className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-700 hover:bg-gray-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="absolute inset-x-0 top-full z-[1000] flex flex-col gap-1 border-b border-gray-200 bg-white px-4 py-3 shadow-lg md:hidden">
            <nav className="flex flex-col text-sm">
              {NAV.map(n => (
                <NavLink
                  key={n.to}
                  to={n.dataView ? { pathname: n.to, search } : n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `rounded px-2 py-2 ${isActive ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`
                  }
                >
                  {t(n.key)}
                </NavLink>
              ))}
            </nav>
            <div className="mt-2 border-t border-gray-100 pt-2">{langButtons}</div>
          </div>
        )}
      </header>

      {/* scrollbar-gutter: stable reserva el canal de la barra siempre. Sin esto las
          vistas largas (Metodología) muestran barra y las cortas (Datos) no, la caja
          de contenido cambia de ancho entre tabs y la columna centrada se corre unos
          px — visible sobre todo con la greca de fondo anclada al viewport. */}
      <main className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
