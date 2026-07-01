import { Outlet, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LocaleCode } from '@/types/data'
import Footer from './Footer'
import AboutPanel from './AboutPanel'

const LANGS: { code: LocaleCode; label: string }[] = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
  { code: 'cn', label: '中文' }
]

export default function Layout() {
  const { t, i18n } = useTranslation()

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="relative z-[1000] border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <a href="https://iclac.cl/" target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img src="/icons/iclac.webp" alt="ICLAC" className="h-10 w-auto object-contain" />
          </a>
          <div className="leading-tight min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">{t('app.subject')}</h1>
            <p className="text-xs text-gray-500 truncate">{t('app.kind')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <nav className="flex gap-4 text-sm">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
              {t('nav.map')}
            </NavLink>
            <NavLink to="/sankey" className={({ isActive }) => (isActive ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
              {t('nav.sankey')}
            </NavLink>
            <NavLink to="/methodology" className={({ isActive }) => (isActive ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
              {t('nav.methodology')}
            </NavLink>
            <NavLink to="/downloads" className={({ isActive }) => (isActive ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
              {t('nav.downloads')}
            </NavLink>
            <NavLink to="/contact" className={({ isActive }) => (isActive ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
              {t('nav.contact')}
            </NavLink>
          </nav>
          <AboutPanel />
          <span className="h-5 w-px bg-gray-300" aria-hidden />
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
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
