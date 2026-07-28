import { useTranslation } from 'react-i18next'
import Citation from '@/components/Citation'

// PENDIENTE VALIDACIÓN CLIENTE (texto migrado del legado, sin editar):
//  1. Rango de años: el texto dice "2003–2025" pero investments.json llega hasta 1997.
//     Confirmar si el rango es correcto o si hay outliers pre-2003 a depurar.
//  2. Sector ICT/TIC no está descrito en la sección "clasificados por industria"
//     (el texto describe 7 de los 8 sectores canónicos). Falta párrafo de TIC.
//  3. El texto EN está desactualizado respecto a ES/CN: lista solo 8 países y omite
//     el párrafo de Venezuela. Pedir al cliente el texto EN vigente.
// Ver docs/generales/next_steps.md.

const PDF_BY_LANG: Record<string, string> = {
  es: '/data/methodology/Methodology_ICLAC_ES.pdf',
  en: '/data/methodology/Methodology_ICLAC_EN.pdf',
  cn: '/data/methodology/Methodology_ICLAC_CN.pdf',
}

export default function MethodologyView() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language.slice(0, 2)
  const pdf = PDF_BY_LANG[lang] ?? PDF_BY_LANG.en

  return (
    <div className="sangria-greca mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-3xl font-semibold text-[#093b4d]">
        {t('methodology.title')}
      </h1>

      {/* Orden pedido en las dos páginas de contenido: título, cita, descarga, cuerpo.
          Quien viene a citar o a bajarse el archivo no tiene que atravesar el texto. */}
      <div className="mb-6">
        <Citation text={t('common.citation_text')} />
      </div>

      <a
        href={pdf}
        download
        className="mb-8 inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
        {t('methodology.download')}
      </a>

      <div
        className="text-justify leading-relaxed text-gray-700 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#093b4d] [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: t('methodology.description') }}
      />
    </div>
  )
}
