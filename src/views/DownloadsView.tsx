import { useTranslation } from 'react-i18next'
import Citation from '@/components/Citation'

// Descarga = dataset COMPLETO (todas las inversiones, todos los países) en un solo
// XLSX. Lo arma el ETL en build (`scripts/etl.mjs`), no el navegador: los datos ya
// están unidos ahí, el bundle se ahorra SheetJS y lo que baja el público es exactamente
// lo que produjo el pipeline. Tres hojas: README, investments, case_studies.
//
// Servimos el archivo procesado, no el XLSX crudo del cliente (tiene las deficiencias
// documentadas en la auditoría).
//
// PENDIENTE CLIENTE (ver next_steps 2.6): sugerir publicar también la base canónica de
// inversores (investors_map) una vez aprobada la auditoría.

const DATASET_URL = '/data/iclac_inversiones_china_latam.xlsx'

export default function DownloadsView() {
  const { t } = useTranslation()

  return (
    <div className="sangria-greca mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-3xl font-semibold text-[#093b4d]">{t('downloads.title')}</h1>

      {/* Título, cita, descarga, cuerpo: el mismo orden que Metodología. */}
      <div className="mb-6">
        <Citation text={t('common.citation_text')} />
      </div>

      <a
        href={DATASET_URL}
        download
        className="inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
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
        {t('downloads.link')}
      </a>
      <p className="mb-8 mt-2 text-xs text-gray-500">{t('downloads.format')}</p>

      <div
        className="text-justify leading-relaxed text-gray-700 [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: t('downloads.description') }}
      />
    </div>
  )
}
