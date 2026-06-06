import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Investment } from '@/types/data'
import { sectorColor } from '@/lib/sectors'
import { formatMoney, groupByCountry, localizedArea, localizedDetail } from '@/lib/projectDocs'

type Props = {
  investments: Investment[]
  lang: string
  onLocate?: (inv: Investment) => void
}

const PinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
    <path
      fillRule="evenodd"
      d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.683 2.282 16.975 16.975 0 001.144.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
      clipRule="evenodd"
    />
  </svg>
)

const Card = ({ inv, lang, onLocate }: { inv: Investment; lang: string; onLocate?: (inv: Investment) => void }) => {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: sectorColor(inv.area_en) }} />
          {localizedArea(inv, lang)}
        </div>
        {onLocate && (
          <button
            type="button"
            onClick={() => onLocate(inv)}
            title={t('list.locate')}
            className="text-teal-600 hover:text-teal-800"
          >
            <PinIcon />
          </button>
        )}
      </div>
      <h4 className="mt-1 font-semibold leading-snug text-gray-900">{localizedDetail(inv, lang)}</h4>
      <dl className="mt-1.5 space-y-0.5 text-xs text-gray-600">
        <div className="flex gap-1">
          <dt className="text-gray-400">{t('list.investor')}:</dt>
          <dd>{inv.investor ?? '—'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-gray-400">{t('list.year')}:</dt>
          <dd>{inv.year ?? '—'}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-gray-400">{t('list.amount')}:</dt>
          <dd>{formatMoney(inv.investment_musd)} {t('list.millions')}</dd>
        </div>
        {inv.location && (
          <div className="flex gap-1">
            <dt className="text-gray-400">{t('list.location')}:</dt>
            <dd>{inv.location}</dd>
          </div>
        )}
      </dl>
      {inv.research_cases.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {t('list.studies')} ({inv.research_cases.length})
          </div>
          <ul className="space-y-1 text-xs">
            {inv.research_cases.map((rc, i) => (
              <li key={i}>
                {rc.link ? (
                  <a
                    href={rc.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 underline decoration-1 hover:text-teal-900"
                  >
                    {rc.caso}
                  </a>
                ) : (
                  <span className="text-gray-700">{rc.caso}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)

export default function ProjectDocsCards({ investments, lang, onLocate }: Props) {
  const { t } = useTranslation()
  const groups = useMemo(() => groupByCountry(investments), [investments])
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const toggle = (country: string) =>
    setOpen(s => {
      const next = new Set(s)
      next.has(country) ? next.delete(country) : next.add(country)
      return next
    })

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const isOpen = open.has(group.country)
        return (
          <section key={group.country}>
            <button
              type="button"
              onClick={() => toggle(group.country)}
              className="sticky top-0 z-10 flex w-full items-center gap-2 bg-white py-1 text-left text-sm font-semibold text-teal-800"
            >
              <Chevron open={isOpen} />
              {t('list.projects_in', { country: group.country, count: group.projects.length })}
            </button>
            {isOpen && (
              <div className="mt-2 space-y-3">
                {group.projects.map(inv => (
                  <Card key={inv.id} inv={inv} lang={lang} onLocate={onLocate} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
