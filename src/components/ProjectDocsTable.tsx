import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Investment, ResearchCase } from '@/types/data'
import { sectorColor } from '@/lib/sectors'
import { flatList, formatMoney, groupByCountry, localizedArea, localizedDetail, type CardSort } from '@/lib/projectDocs'
import MiniSegmented from './MiniSegmented'

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
  <div className="mt-3 text-left">
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

// One investment row + its expandable detail panel. In flat view the country is
// its own column (no country grouping to carry it); in grouped view the country
// lives in the group header, so the last column shows the locality instead.
function InvRow({
  inv,
  idx,
  variant,
  lang,
  open,
  onToggle,
  onLocate
}: {
  inv: Investment
  idx: number
  variant: 'grouped' | 'flat'
  lang: string
  open: boolean
  onToggle: () => void
  onLocate?: (inv: Investment) => void
}) {
  const { t } = useTranslation()
  const cases = inv.research_cases ?? []
  const hasStudies = cases.length > 0
  const zebra = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
  return (
    <Fragment>
      <tr className={`${zebra} cursor-pointer hover:bg-teal-50`} onClick={onToggle}>
        <td className="px-1 py-2 align-top">
          <button type="button" aria-label={t('list.details')} className="text-gray-500 hover:text-gray-800">
            <Chevron open={open} />
          </button>
        </td>
        {variant === 'flat' && (
          <td className="px-2 py-2 align-top text-gray-700">
            <span className="block truncate">{inv.country ?? '—'}</span>
          </td>
        )}
        <td className="px-2 py-2 align-top font-medium text-gray-900">{inv.investor ?? '—'}</td>
        <td className="px-2 py-2 align-top text-gray-700">{inv.year ?? '—'}</td>
        <td className="px-2 py-2 align-top">
          <span className="flex items-start gap-1.5">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: sectorColor(inv.area_en) }}
            />
            <span className="min-w-0">{localizedArea(inv, lang)}</span>
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-2 align-top text-right tabular-nums text-gray-700">
          {inv.investment_musd == null ? '—' : `${formatMoney(inv.investment_musd)} MM`}
        </td>
        {variant === 'grouped' && (
          <td className="px-2 py-2 align-top text-gray-700">
            <span className="flex items-center gap-1">
              {onLocate && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onLocate(inv)
                  }}
                  title={t('list.locate')}
                  className="shrink-0 text-teal-600 hover:text-teal-800"
                >
                  <PinIcon />
                </button>
              )}
              <span className="min-w-0 truncate" title={inv.location ?? undefined}>
                {inv.location ?? '—'}
              </span>
            </span>
          </td>
        )}
      </tr>
      {open && (
        <tr className={zebra}>
          <td colSpan={6} className="bg-gray-50 px-4 py-3 text-left">
            <p className="text-sm font-medium text-gray-900">{localizedDetail(inv, lang)}</p>
            {inv.location && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
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
                <span>
                  {t('list.location')}: {inv.location}
                </span>
              </p>
            )}
            {hasStudies && <StudyLinks cases={cases} note={t('list.studies_network')} />}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// Column header row. Flat adds a País column and drops Locality (locality moves
// to the expanded detail); grouped is the reverse.
function TableHead({ variant }: { variant: 'grouped' | 'flat' }) {
  const { t } = useTranslation()
  return (
    <thead className="bg-teal-700 text-white text-xs">
      <tr>
        <th className="w-7 px-1 py-2" />
        {variant === 'flat' && <th className="w-20 px-2 py-2 text-left font-medium">{t('filter.country')}</th>}
        <th className="px-2 py-2 text-left font-medium">{t('list.investor')}</th>
        <th className="w-12 px-2 py-2 text-left font-medium">{t('list.year')}</th>
        <th className="px-2 py-2 text-left font-medium">{t('list.area')}</th>
        <th className="w-20 px-2 py-2 text-right font-medium">{t('list.amount')}</th>
        {variant === 'grouped' && <th className="w-24 px-2 py-2 text-left font-medium">{t('list.location')}</th>}
      </tr>
    </thead>
  )
}

export default function ProjectDocsTable({ investments, lang, onLocate }: Props) {
  const { t } = useTranslation()
  const [sortBy, setSortBy] = useState<CardSort>('year')
  const [grouped, setGrouped] = useState(true)
  const groups = useMemo(() => (grouped ? groupByCountry(investments, sortBy) : []), [investments, sortBy, grouped])
  const flat = useMemo(() => (grouped ? [] : flatList(investments, sortBy)), [investments, sortBy, grouped])
  const [openCountries, setOpenCountries] = useState<Set<string>>(() => new Set())
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())

  // Open the first country on first load so rows are visible immediately
  // ("see more at once", Margareth UAT) instead of a list of collapsed bars.
  const didInit = useRef(false)
  useEffect(() => {
    if (!didInit.current && groups.length) {
      didInit.current = true
      setOpenCountries(new Set([groups[0].country]))
    }
  }, [groups])

  const toggleIn = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  const toggleRow = (id: string) => setOpenRows(s => toggleIn(s, id))

  return (
    <div className="w-full text-sm">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-gray-200 bg-white px-3 py-2">
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

      {grouped ? (
        groups.map(group => {
          const open = openCountries.has(group.country)
          return (
            <div key={group.country} className="border-b border-gray-200">
              <button
                type="button"
                onClick={() => setOpenCountries(s => toggleIn(s, group.country))}
                className="flex w-full items-center gap-2 bg-gray-100 px-4 py-3 text-left font-semibold text-teal-800 hover:bg-gray-200"
              >
                <Chevron open={open} />
                {t('list.projects_in', { country: group.country, count: group.projects.length })}
              </button>
              {open && (
                <table className="w-full table-fixed border-collapse">
                  <TableHead variant="grouped" />
                  <tbody>
                    {group.projects.map((inv, idx) => (
                      <InvRow
                        key={inv.id}
                        inv={inv}
                        idx={idx}
                        variant="grouped"
                        lang={lang}
                        open={openRows.has(inv.id)}
                        onToggle={() => toggleRow(inv.id)}
                        onLocate={onLocate}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })
      ) : (
        <table className="w-full table-fixed border-collapse">
          <TableHead variant="flat" />
          <tbody>
            {flat.map((inv, idx) => (
              <InvRow
                key={inv.id}
                inv={inv}
                idx={idx}
                variant="flat"
                lang={lang}
                open={openRows.has(inv.id)}
                onToggle={() => toggleRow(inv.id)}
                onLocate={onLocate}
              />
            ))}
          </tbody>
        </table>
      )}

      {(grouped ? groups.length === 0 : flat.length === 0) && (
        <p className="px-3 py-4 text-sm text-gray-400">{t('list.no_results')}</p>
      )}
    </div>
  )
}
