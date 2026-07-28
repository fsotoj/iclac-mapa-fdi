import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type Logo = { src: string; alt: string; href?: string }

// ICLAC logo lives in the header; the footer carries only partner logos.
// Image assets live in /public/icons/ — supplied from the legacy project.
const PARTNERS: Logo[] = [
  { src: '/icons/theDialogue.webp', alt: 'The Dialogue', href: 'https://www.thedialogue.org/' },
  { src: '/icons/cechap.webp', alt: 'CECHAP', href: 'https://cechap.up.edu.pe/' },
  {
    src: '/icons/milenio.webp',
    alt: 'Núcleo Milenio',
    href: 'https://anid.cl/centros-e-investigacion-asociativa/nucleos-milenio/'
  },
  { src: '/icons/ceach.webp', alt: 'CEACH' },
  { src: '/icons/camaraArgentinaChina.webp', alt: 'Cámara Argentino China' },
  { src: '/icons/camaraColombiaChina.webp', alt: 'Cámara Colombo China' }
]

function LogoImg({ logo, className }: { logo: Logo; className: string }) {
  const img = (
    <img
      src={logo.src}
      alt={logo.alt}
      className={`w-auto object-contain ${className}`}
    />
  )
  return logo.href ? (
    <a href={logo.href} target="_blank" rel="noopener noreferrer" className="shrink-0">
      {img}
    </a>
  ) : (
    <span className="shrink-0">{img}</span>
  )
}

export default function Footer() {
  const { t } = useTranslation()
  // Los seis logos ocupan 133 px de alto en un teléfono: 21% de una pantalla de 640,
  // permanentes, sobre las dos herramientas que se miran a pantalla completa. En móvil
  // el crédito parte como una línea y los logos se despliegan a demanda; en escritorio
  // no cambia nada.
  const [open, setOpen] = useState(false)

  return (
    <footer className="border-t border-gray-200 px-4 py-2 sm:px-6 sm:py-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-brand-dark md:hidden"
      >
        {t('footer.partners')}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className={`h-4 w-4 transition-transform ${open ? '' : 'rotate-180'}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />
        </svg>
      </button>
      <div
        className={`${open ? 'mt-2 flex' : 'hidden'} flex-wrap items-center justify-center gap-x-6 gap-y-1 sm:gap-x-8 sm:gap-y-2 md:mt-0 md:flex`}
      >
        <span className="hidden text-xs font-semibold uppercase tracking-wide text-gray-500 md:inline">
          {t('footer.partners')}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {PARTNERS.map(l => (
            <LogoImg key={l.src} logo={l} className="h-7 sm:h-9" />
          ))}
        </div>
      </div>
    </footer>
  )
}
