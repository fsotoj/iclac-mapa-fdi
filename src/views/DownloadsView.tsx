import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Investment, ResearchCase } from '@/types/data'

// Descarga = dataset COMPLETO (todas las inversiones, todos los países) en un solo
// archivo. Servimos el JSON procesado (public/data/investments.json), no el XLSX
// crudo del cliente (tiene las deficiencias documentadas en la auditoría).
//
// investments.json es "lean" (sin research_cases; ver split en pipeline_datos.md).
// Para que la descarga sea el dataset COMPLETO, al hacer clic unimos research.json
// por id en cliente y descargamos el resultado — así no hace falta un archivo
// combinado extra en el build y siempre queda en sync con los dos que se sirven.
//
// PENDIENTE CLIENTE (ver next_steps 2.6): (a) ¿formato preferido JSON vs XLSX/CSV?
// (b) sugerir publicar también la base canónica de inversores chinos (investors_map)
// una vez aprobada la auditoría.

const DATASET_FILENAME = 'iclac_inversiones_china_latam.json'

export default function DownloadsView() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const handleDownload = async () => {
    setBusy(true)
    setError(false)
    try {
      const [inv, research] = await Promise.all([
        fetch('/data/investments.json').then(r => {
          if (!r.ok) throw new Error(`investments.json: ${r.status}`)
          return r.json() as Promise<Investment[]>
        }),
        fetch('/data/research.json').then(
          r => (r.ok ? r.json() : {}) as Promise<Record<string, ResearchCase[]>>
        )
      ])
      for (const row of inv) row.research_cases = research[row.id] ?? []
      const blob = new Blob([JSON.stringify(inv)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = DATASET_FILENAME
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sangria-greca mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold text-[#093b4d]">
        {t('downloads.title')}
      </h1>

      <div
        className="mb-8 text-justify leading-relaxed text-gray-700 [&_p]:mb-4"
        dangerouslySetInnerHTML={{ __html: t('downloads.description') }}
      />

      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-[#093b4d] px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
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
        {busy ? t('downloads.preparing') : t('downloads.link')}
      </button>
      <p className="mt-2 text-xs text-gray-500">{t('downloads.format')}</p>
      {error && <p className="mt-2 text-xs text-red-600">{t('downloads.error')}</p>}
    </div>
  )
}
