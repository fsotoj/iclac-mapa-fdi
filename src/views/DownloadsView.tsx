import { useTranslation } from 'react-i18next'

// Descarga = dataset COMPLETO (todas las inversiones, todos los países) en un solo
// archivo. Servimos el JSON procesado (public/data/investments.json), no el XLSX
// crudo del cliente (tiene las deficiencias documentadas en la auditoría).
// PENDIENTE CLIENTE (ver next_steps 2.6): (a) ¿formato preferido JSON vs XLSX/CSV?
// (b) sugerir publicar también la base canónica de inversores chinos (investors_map)
// una vez aprobada la auditoría.

const DATASET_URL = '/data/investments.json'
const DATASET_FILENAME = 'iclac_inversiones_china_latam.json'

export default function DownloadsView() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold text-[#093b4d]">
        {t('downloads.title')}
      </h1>

      <div
        className="mb-8 text-justify leading-relaxed text-gray-700 [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: t('downloads.description') }}
      />

      <a
        href={DATASET_URL}
        download={DATASET_FILENAME}
        className="inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0c4d63]"
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
      <p className="mt-2 text-xs text-gray-500">{t('downloads.format')}</p>
    </div>
  )
}
