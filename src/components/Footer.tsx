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
  return (
    <footer className="border-t border-gray-200 px-6 py-3">
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('footer.partners')}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-6">
          {PARTNERS.map(l => (
            <LogoImg key={l.src} logo={l} className="h-7" />
          ))}
        </div>
      </div>
    </footer>
  )
}
