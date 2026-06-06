import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Investment, ResearchCase } from '@/types/data'
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

const StudyLinks = ({ cases, note }: { cases: ResearchCase[]; note: string }) => (
  <div className="px-6 py-3 bg-gray-50 text-left">
    <ul className="space-y-1">
      {cases.map((rc, i) => (
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
    <p className="mt-2 text-xs italic text-gray-400">{note}</p>
  </div>
)

export default function ProjectDocsTable({ investments, lang, onLocate }: Props) {
  const { t } = useTranslation()
  const groups = useMemo(() => groupByCountry(investments), [investments])
  const [openCountries, setOpenCountries] = useState<Set<string>>(() => new Set())
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  return (
    <div className="w-full text-sm">
      {groups.map(group => {
        const open = openCountries.has(group.country)
        return (
          <div key={group.country} className="border-b border-gray-200">
            <button
              type="button"
              onClick={() => setOpenCountries(s => toggle(s, group.country))}
              className="flex w-full items-center gap-2 bg-gray-100 px-4 py-3 text-left font-semibold text-teal-800 hover:bg-gray-200"
            >
              <Chevron open={open} />
              {t('list.projects_in', { country: group.country, count: group.projects.length })}
            </button>

            {open && (
              <table className="w-full border-collapse">
                <thead className="bg-teal-700 text-white text-xs">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2 text-left font-medium">{t('list.project_name')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.investor')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.year')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.area')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.amount')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.projects.map((inv, idx) => {
                    const hasStudies = inv.research_cases.length > 0
                    const rowOpen = openRows.has(inv.id)
                    const zebra = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    return (
                      <Fragment key={inv.id}>
                        <tr className={zebra}>
                          <td className="px-2 py-2 align-top">
                            {hasStudies && (
                              <button
                                type="button"
                                onClick={() => setOpenRows(s => toggle(s, inv.id))}
                                title={t('list.studies')}
                                className="text-gray-500 hover:text-gray-800"
                              >
                                <Chevron open={rowOpen} />
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top font-medium text-gray-900">{localizedDetail(inv, lang)}</td>
                          <td className="px-3 py-2 align-top text-gray-700">{inv.investor ?? '—'}</td>
                          <td className="px-3 py-2 align-top text-gray-700">{inv.year ?? '—'}</td>
                          <td className="px-3 py-2 align-top">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ background: sectorColor(inv.area_en) }}
                              />
                              {localizedArea(inv, lang)}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top text-gray-700">
                            {formatMoney(inv.investment_musd)} {t('list.millions')}
                          </td>
                          <td className="px-3 py-2 align-top text-gray-700">
                            <span className="inline-flex items-center gap-1.5">
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
                              {inv.location ?? '—'}
                            </span>
                          </td>
                        </tr>
                        {hasStudies && rowOpen && (
                          <tr className={zebra}>
                            <td colSpan={7} className="p-0">
                              <StudyLinks cases={inv.research_cases} note={t('list.studies_network')} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
