import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Investment } from '@/types/data'
import { sectorColor } from '@/lib/sectors'
import { flatList, formatMoney, groupByCountry, localizedDetail, studyHref, type CardSort } from '@/lib/projectDocs'
import { useFilters } from '@/hooks/useFilters'
import MiniSegmented from './MiniSegmented'
import ProjectSearchBox from './ProjectSearchBox'

type Props = {
  investments: Investment[]
  lang: string
  onLocate?: (inv: Investment) => void
  onIsolate?: (inv: Investment) => void
  focusedId?: string | null
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

const DocIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-4 w-4 shrink-0" fill="currentColor">
    <path d="M19 10h7v2h-7zm0 5h7v2h-7zm0 5h7v2h-7zM6 10h7v2H6zm0 5h7v2H6zm0 5h7v2H6z" />
    <path d="M28 5H4a2.002 2.002 0 0 0-2 2v18a2.002 2.002 0 0 0 2 2h24a2.002 2.002 0 0 0 2-2V7a2.002 2.002 0 0 0-2-2M4 7h11v18H4Zm13 18V7h11v18Z" />
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

const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path strokeLinecap="round" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
)

const Card = ({
  inv,
  lang,
  onLocate,
  onIsolate,
  focused
}: {
  inv: Investment
  lang: string
  onLocate?: (inv: Investment) => void
  onIsolate?: (inv: Investment) => void
  focused?: boolean
}) => {
  const { t } = useTranslation()
  const [showStudies, setShowStudies] = useState(false)
  const meta = [inv.investor, inv.year].filter(Boolean).join(' · ')
  const cases = inv.research_cases ?? []

  return (
    <div className="group rounded-md border border-gray-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-px hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: sectorColor(inv.area_en) }}
        />
        <h4 className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900">
          {localizedDetail(inv, lang)}
        </h4>
        {onIsolate && (
          <button
            type="button"
            onClick={() => onIsolate(inv)}
            aria-pressed={focused}
            title={t(focused ? 'list.isolate_off' : 'list.isolate')}
            className={`shrink-0 rounded ${
              focused ? 'bg-gray-900 p-0.5 text-white hover:bg-brand-dark' : 'text-gray-400 hover:text-brand-dark'
            }`}
          >
            <TargetIcon />
          </button>
        )}
        {onLocate && (
          <button
            type="button"
            onClick={() => onLocate(inv)}
            title={t('list.locate')}
            className="shrink-0 text-teal-600 hover:text-teal-800"
          >
            <PinIcon />
          </button>
        )}
      </div>

      {meta && <div className="mt-1 pl-[18px] text-xs text-gray-500">{meta}</div>}

      <div className="mt-0.5 pl-[18px] text-xs text-gray-600">
        <span>
          {formatMoney(inv.investment_musd)} {t('list.millions')}
        </span>
        {inv.location && <span className="text-gray-400"> · {inv.location}</span>}
      </div>

      {cases.length > 0 && (
        <div className="mt-2 pl-[18px]">
          <button
            type="button"
            onClick={() => setShowStudies(s => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900"
          >
            <DocIcon />
            {t('list.studies')} ({cases.length})
            <Chevron open={showStudies} />
          </button>
          {showStudies && (
            <ul className="mt-1 space-y-1 text-xs">
              {cases.map((rc, i) => (
                <li key={i}>
                  {studyHref(rc.link) ? (
                    <a
                      href={studyHref(rc.link)!}
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
          )}
        </div>
      )}
    </div>
  )
}

export default function ProjectDocsCards({ investments, lang, onLocate, onIsolate, focusedId }: Props) {
  const { t } = useTranslation()
  const { filters } = useFilters()
  const query = filters.query
  const [sortBy, setSortBy] = useState<CardSort>('year')
  const [grouped, setGrouped] = useState(true)
  const groups = useMemo(
    () => (grouped ? groupByCountry(investments, sortBy) : []),
    [investments, sortBy, grouped]
  )
  const flat = useMemo(
    () => (grouped ? [] : flatList(investments, sortBy)),
    [investments, sortBy, grouped]
  )
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  // Auto-expand matches when entering search, collapse all when clearing —
  // but leave countries collapsible while a query is active.
  const hadQuery = useRef(false)
  useEffect(() => {
    const has = query.length > 0
    if (has && !hadQuery.current) setOpen(new Set(groups.map(g => g.country)))
    else if (!has && hadQuery.current) setOpen(new Set())
    hadQuery.current = has
  }, [query, groups])

  const toggle = (country: string) =>
    setOpen(s => {
      const next = new Set(s)
      if (next.has(country)) next.delete(country)
      else next.add(country)
      return next
    })

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white px-3 py-2">
        <ProjectSearchBox />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-gray-500">{t('list.sort_by')}</span>
            <MiniSegmented
              items={[
                { value: 'year', label: t('list.sort_year') },
                { value: 'amount', label: t('list.sort_amount') }
              ]}
              value={sortBy}
              onPick={setSortBy}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-gray-500">{t('list.view_as')}</span>
            <MiniSegmented
              items={[
                { value: 'grouped', label: t('list.grouped') },
                { value: 'flat', label: t('list.flat') }
              ]}
              value={grouped ? 'grouped' : 'flat'}
              onPick={v => setGrouped(v === 'grouped')}
            />
          </div>
        </div>
      </div>

      {(grouped ? groups.length === 0 : flat.length === 0) && (
        <p className="px-3 py-4 text-sm text-gray-400">{t('list.no_results')}</p>
      )}

      {!grouped && flat.length > 0 && (
        <div className="space-y-2 px-3 py-3">
          {flat.map(inv => (
            <Card
              key={inv.id}
              inv={inv}
              lang={lang}
              onLocate={onLocate}
              onIsolate={onIsolate}
              focused={focusedId === inv.id}
            />
          ))}
        </div>
      )}

      {groups.map(group => {
        const isOpen = open.has(group.country)
        return (
          <section key={group.country}>
            <button
              type="button"
              onClick={() => toggle(group.country)}
              className="sticky top-[75px] z-10 flex w-full items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm font-semibold text-teal-800 shadow-sm"
            >
              <Chevron open={isOpen} />
              {t('list.projects_in', { country: group.country, count: group.projects.length })}
            </button>
            {isOpen && (
              <div className="space-y-2 px-3 py-3">
                {group.projects.map(inv => (
                  <Card
                    key={inv.id}
                    inv={inv}
                    lang={lang}
                    onLocate={onLocate}
                    onIsolate={onIsolate}
                    focused={focusedId === inv.id}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
