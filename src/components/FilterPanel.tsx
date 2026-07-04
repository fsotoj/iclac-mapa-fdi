import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFilters } from '@/hooks/useFilters'
import { useIsMobile } from '@/hooks/useMediaQuery'
import type { PieMetric, ResearchFilter } from '@/lib/filter'
import type { CompanyOption, ConsortiumMode } from '@/lib/sankey'
import CollapsibleSection from './CollapsibleSection'
import YearRangeSlider from './YearRangeSlider'
import CheckList from './CheckList'
import InvestorFilter from './InvestorFilter'

type Props = {
  countries: string[]
  yearMin: number
  yearMax: number
  companies: CompanyOption[]
}

// Shared 20×20 stroke icons. One viewBox, consistent weight across the rail.
const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
    {path}
  </svg>
)
const IconChevronLeft = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />)
const IconChevronRight = icon(<path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />)
const IconGlobe = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.3 3.75-5.3 3.75-9S14.5 5.3 12 3m0 18c-2.5-2.3-3.75-5.3-3.75-9S9.5 5.3 12 3M3.5 9h17M3.5 15h17" />)
const IconCalendar = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 8.25h18M4.5 5.25h15A1.5 1.5 0 0 1 21 6.75v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.75v-12a1.5 1.5 0 0 1 1.5-1.5Z" />)
const IconTag = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a2.25 2.25 0 0 0 3.182 0l4.318-4.318a2.25 2.25 0 0 0 0-3.182L11.16 3.66A2.25 2.25 0 0 0 9.568 3ZM6 6h.008v.008H6V6Z" />)
const IconBuilding = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h9v18h-9V3Zm9 6h6v12h-6M7.5 6.75h.008v.008H7.5V6.75Zm0 3h.008v.008H7.5V9.75Zm0 3h.008v.008H7.5v-.008Z" />)
const IconDoc = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25V8.25L13.5 2.25H6.75A2.25 2.25 0 0 0 4.5 4.5v14.25A2.25 2.25 0 0 0 6.75 21Z" />)
const IconChart = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />)
const IconBriefcase = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.1a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-4.1M12 12.75h.008v.008H12v-.008ZM3.75 9.75A2.25 2.25 0 0 1 6 7.5h12a2.25 2.25 0 0 1 2.25 2.25v2.25a17.9 17.9 0 0 1-8.25 2 17.9 17.9 0 0 1-8.25-2V9.75ZM15 7.5V6a2.25 2.25 0 0 0-2.25-2.25h-1.5A2.25 2.25 0 0 0 9 6v1.5" />)
const IconBank = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2.25 8.25h19.5L12 3Zm-7.5 7.5V18m5-7.5V18m5-7.5V18m5-7.5V18M2.25 21h19.5" />)
const IconGroup = icon(<path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />)

// Rail entries mirror the panel sections top-to-bottom; null = group divider.
const RAIL: ({ key: string; node: ReactNode } | null)[] = [
  { key: 'filter.country', node: IconGlobe },
  { key: 'filter.year', node: IconCalendar },
  { key: 'filter.project_type', node: IconTag },
  { key: 'filter.construction', node: IconBuilding },
  { key: 'filter.case_studies', node: IconDoc },
  null,
  { key: 'filter.company', node: IconBriefcase },
  { key: 'sankey.ownership', node: IconBank },
  { key: 'sankey.consortiums', node: IconGroup },
  null,
  { key: 'filter.map_shows', node: IconChart }
]

const OWNERSHIP_VALUES = ['SASAC', 'SOE', 'POE', 'MIXED', 'UNKNOWN'] as const
const CONSORTIUM_MODES: ConsortiumMode[] = ['all', 'only', 'none']

// Thin uppercase group separator ("Inversiones" / "Inversores" / "Visualización").
function GroupHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  )
}

const PROJECT_TYPES = ['Adquisición', 'Greenfield'] as const

// Map display: individual points, or country pies aggregated by count / money.
type MapMode = 'points' | PieMetric
const MAP_MODES: MapMode[] = ['points', 'count', 'money']
const MAP_MODE_LABELS: Record<MapMode, string> = {
  points: 'filter.points',
  count: 'filter.by_project',
  money: 'filter.by_money'
}

// Data layer treats [] as "all". Legacy URLs may still carry the '__none__'
// sentinel (old select-all UI); the UI strips it and the first toggle clears it.
const NONE = '__none__'

const toggleInArray = (arr: string[], v: string): string[] =>
  arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

// Shared segmented control for type / case studies / map mode. Joined buttons,
// active = dark fill. Multi-select (type) and single-select (others) both use it.
type SegItem<T extends string> = { value: T; label: string }
function Segmented<T extends string>({
  items,
  isActive,
  onPick
}: {
  items: SegItem<T>[]
  isActive: (v: T) => boolean
  onPick: (v: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded border border-gray-300 text-xs">
      {items.map((it, i) => (
        <button
          key={it.value}
          onClick={() => onPick(it.value)}
          aria-pressed={isActive(it.value)}
          className={`flex-1 px-2 py-1.5 ${i > 0 ? 'border-l border-gray-300' : ''} ${
            isActive(it.value) ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export default function FilterPanel({ countries, yearMin, yearMax, companies }: Props) {
  const { t } = useTranslation()
  const { filters, setFilters, reset } = useFilters()
  const isMobile = useIsMobile()
  // Collapsed by default on phones so the map gets the full width; the thin rail
  // stays as the affordance to reopen. Desktop keeps the panel open.
  const [collapsed, setCollapsed] = useState(isMobile)

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-3">
        <button
          onClick={() => setCollapsed(false)}
          title={t('filter.expand')}
          aria-label={t('filter.expand')}
          className="flex h-9 w-9 items-center justify-center rounded text-gray-700 hover:bg-gray-100"
        >
          {IconChevronRight}
        </button>
        <div className="my-1 h-px w-6 bg-gray-200" />
        {RAIL.map((r, i) =>
          r === null ? (
            <div key={`div-${i}`} className="my-1 h-px w-6 bg-gray-200" />
          ) : (
            <button
              key={r.key}
              onClick={() => setCollapsed(false)}
              title={t(r.key)}
              aria-label={t(r.key)}
              className="flex h-9 w-9 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              {r.node}
            </button>
          )
        )}
      </aside>
    )
  }

  const yMin = filters.yearMin ?? yearMin
  const yMax = filters.yearMax ?? yearMax
  // Empty selection means "all" in the data layer; treat it as every box checked.
  // Same semantics as the Sankey: clicking one country from "all" narrows to it.
  const selectedCountries = filters.countries.filter(c => c !== NONE)
  const allCountries = selectedCountries.length === 0

  return (
    <>
      {/* Mobile: dim the map behind the drawer; tap to close. */}
      <div
        className="fixed inset-0 z-[855] bg-black/30 md:hidden"
        onClick={() => setCollapsed(true)}
        aria-hidden
      />
      <aside className="absolute inset-y-0 left-0 z-[860] w-[85vw] max-w-xs shadow-2xl shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4 space-y-5 text-sm md:static md:z-auto md:w-72 md:max-w-none md:shadow-none">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCollapsed(true)}
            title={t('filter.collapse')}
            aria-label={t('filter.collapse')}
            className="-ml-1 flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            {IconChevronLeft}
          </button>
          <h3 className="font-semibold text-base">{t('filter.title')}</h3>
        </div>
        <button
          onClick={reset}
          className="text-xs text-gray-500 hover:text-gray-900 underline"
        >
          {t('filter.clear_all')}
        </button>
      </div>

      <GroupHeader label={t('filter.group_investments')} />

      <CollapsibleSection
        label={t('filter.country')}
        summary={
          allCountries ? t('common.all') : t('filter.n_selected', { count: selectedCountries.length })
        }
      >
        <div className="rounded border border-gray-300">
          <CheckList
            items={countries}
            selected={selectedCountries}
            onToggle={c => setFilters({ countries: toggleInArray(selectedCountries, c) })}
          />
        </div>
      </CollapsibleSection>

      <section>
        <label className="block text-xs font-medium text-gray-600 mb-2">{t('filter.year')}</label>
        <YearRangeSlider
          min={yearMin}
          max={yearMax}
          valueMin={yMin}
          valueMax={yMax}
          onChange={(vMin, vMax) => setFilters({ yearMin: vMin, yearMax: vMax })}
        />
      </section>

      <section>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('filter.project_type')}</label>
        <Segmented
          items={PROJECT_TYPES.map(pt => ({ value: pt, label: t(`project_type.${pt}`) }))}
          isActive={pt => filters.types.length === 0 || filters.types.includes(pt)}
          onPick={pt => {
            const current = filters.types.length === 0 ? [...PROJECT_TYPES] : filters.types
            const next = toggleInArray(current, pt)
            setFilters({ types: next.length === PROJECT_TYPES.length ? [] : next })
          }}
        />
      </section>

      <section>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.includeConstruction}
            onChange={e => setFilters({ includeConstruction: e.target.checked })}
          />
          <span className="text-xs font-medium text-gray-600">{t('filter.construction')}</span>
        </label>
      </section>

      <section>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('filter.case_studies')}</label>
        <Segmented
          items={(['all', 'yes', 'no'] as ResearchFilter[]).map(opt => ({
            value: opt,
            label: opt === 'all' ? t('common.all') : opt === 'yes' ? t('filter.with_studies') : t('filter.without_studies')
          }))}
          isActive={opt => filters.research === opt}
          onPick={opt => setFilters({ research: opt })}
        />
      </section>

      <GroupHeader label={t('filter.group_investors')} />

      <CollapsibleSection
        label={t('filter.company')}
        summary={
          filters.investors.length === 0 ? t('common.all') : t('filter.n_selected', { count: filters.investors.length })
        }
      >
        <div className="rounded border border-gray-300">
          <InvestorFilter
            options={companies}
            selected={filters.investors}
            onChange={ids => setFilters({ investors: ids })}
            metric={filters.pieMetric}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        label={t('sankey.ownership')}
        summary={
          filters.ownership.length === 0 ? t('common.all') : t('filter.n_selected', { count: filters.ownership.length })
        }
      >
        <div className="rounded border border-gray-300 p-2 space-y-1">
          {OWNERSHIP_VALUES.map(o => (
            <label key={o} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.ownership.length === 0 || filters.ownership.includes(o)}
                onChange={() => {
                  const base = filters.ownership.length === 0 ? [...OWNERSHIP_VALUES] : filters.ownership
                  const next = toggleInArray(base, o)
                  setFilters({ ownership: next.length === OWNERSHIP_VALUES.length ? [] : next })
                }}
              />
              <span className="min-w-0 flex-1 truncate">{t(`sankey.own_${o.toLowerCase()}`, o)}</span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      <section>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t('sankey.consortiums')}</label>
        <Segmented
          items={CONSORTIUM_MODES.map(m => ({ value: m, label: t(`sankey.cons_${m}`) }))}
          isActive={m => filters.consortium === m}
          onPick={m => setFilters({ consortium: m })}
        />
      </section>

      <GroupHeader label={t('filter.group_display')} />

      <section>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t('filter.map_shows')}</label>
        <Segmented
          items={MAP_MODES.map(m => ({ value: m, label: t(MAP_MODE_LABELS[m]) }))}
          isActive={m => (m === 'points' ? !filters.pieByCountry : filters.pieByCountry && filters.pieMetric === m)}
          onPick={m => setFilters(m === 'points' ? { pieByCountry: false } : { pieByCountry: true, pieMetric: m })}
        />
      </section>

      </aside>
    </>
  )
}
