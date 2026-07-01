import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { SankeyChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import type { Investment } from '@/types/data'
import type { InvestorMap, SankeyMetric } from '@/lib/sankey'
import { buildSankeyData, distinctCompanies, resolveCompanyId } from '@/lib/sankey'
import { sectorColor } from '@/lib/sectors'
import { applyFilters, distinctSectors, distinctCountries } from '@/lib/filter'
import { useFilters } from '@/hooks/useFilters'
import InvestorFilter from '@/components/InvestorFilter'
import FilterDropdown from '@/components/FilterDropdown'

// Register only what the Sankey needs — the bundler drops the rest of echarts.
echarts.use([SankeyChart, TooltipComponent, CanvasRenderer])

// Fallback node colors per depth: investor / country (sector uses sectorColor).
const LEVEL_COLOR = ['#545453', '#377F83', '#0CCABC'] as const
const TOP_N = 20

type ClickParams = { dataType?: string; name?: string }

// Checkbox list for the país / sector dropdowns. Empty selection = all (every box
// checked); clicking one from "all" narrows to just it (same as clicking a node).
function CheckList({
  items,
  selected,
  onToggle,
  color,
  label
}: {
  items: string[]
  selected: string[]
  onToggle: (v: string) => void
  color?: (v: string) => string
  label?: (v: string) => string
}) {
  const all = selected.length === 0
  return (
    <div className="max-h-72 overflow-y-auto p-2">
      {items.map(it => {
        const active = all || selected.includes(it)
        return (
          <label key={it} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
            <input type="checkbox" checked={active} onChange={() => onToggle(it)} className="shrink-0" />
            {color && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(it), opacity: active ? 1 : 0.4 }} />
            )}
            <span className="min-w-0 flex-1 truncate text-gray-800">{label ? label(it) : it}</span>
          </label>
        )
      })}
    </div>
  )
}

export default function SankeyView() {
  const { t, i18n } = useTranslation()
  const { filters, setFilters } = useFilters()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [map, setMap] = useState<InvestorMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<SankeyMetric>('money')

  useEffect(() => {
    Promise.all([
      fetch('/data/investments.json').then(r => {
        if (!r.ok) throw new Error(`investments.json: ${r.status}`)
        return r.json()
      }),
      // Map is optional: unmapped investors fall back to their raw name.
      fetch('/data/investors_map.json').then(r => (r.ok ? r.json() : {}))
    ])
      .then(([inv, m]: [Investment[], InvestorMap]) => {
        setInvestments(inv)
        setMap(m)
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  // Company options for the filter: from the full dataset so the list is stable.
  const companies = useMemo(() => distinctCompanies(investments, map), [investments, map])
  const sectors = useMemo(() => distinctSectors(investments), [investments])
  const countries = useMemo(() => distinctCountries(investments), [investments])
  const nameToId = useMemo(() => new Map(companies.map(c => [c.name, c.id])), [companies])

  // Shares the map's URL filters (country/year/sector/type/construction), then
  // applies the Sankey-only investor selection on top (by canonical company_id).
  const scoped = useMemo(() => {
    const base = applyFilters(investments, filters)
    if (filters.investors.length === 0) return base
    const sel = new Set(filters.investors)
    return base.filter(inv => sel.has(resolveCompanyId(inv.investor ?? '', map)))
  }, [investments, filters, map])

  // With a selection, show every chosen company (don't bucket into "others").
  const topN = filters.investors.length > 0 ? Math.max(filters.investors.length, 1) : TOP_N
  const data = useMemo(
    () => buildSankeyData(scoped, map, { metric, topN, othersInvestor: t('sankey.others') }),
    [scoped, map, metric, topN, t]
  )

  // Node identity stays area_en (stable for click→filter); only the DISPLAY label
  // is localized. Non-sector nodes show their raw name.
  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of data.nodes) m.set(n.name, n.depth === 2 ? t(`sector.${n.name}`, n.name) : n.name)
    return m
  }, [data, t])

  const fmt = useMemo(
    () => new Intl.NumberFormat(i18n.language === 'cn' ? 'zh' : i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language]
  )
  const fmtVal = (v: number): string => (metric === 'money' ? `US$ ${fmt.format(v)} MM` : fmt.format(v))

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const par = p as { dataType?: string; name?: string; value?: number; data?: { source?: string; target?: string } }
          const lbl = (name?: string) => (name ? labelOf.get(name) ?? name : '')
          if (par.dataType === 'edge' && par.data) {
            return `${lbl(par.data.source)} → ${lbl(par.data.target)}<br/><b>${fmtVal(par.value ?? 0)}</b>`
          }
          return `${lbl(par.name)}<br/><b>${fmtVal(par.value ?? 0)}</b>`
        }
      },
      series: [
        {
          type: 'sankey',
          draggable: false,
          data: data.nodes.map(n => ({
            name: n.name,
            depth: n.depth,
            itemStyle: { color: n.depth === 2 ? sectorColor(n.name) : LEVEL_COLOR[n.depth] }
          })),
          links: data.links,
          lineStyle: { color: 'gradient', opacity: 0.25, curveness: 0.5 },
          label: {
            fontSize: 11,
            color: '#111',
            formatter: (p: unknown) => {
              const name = (p as { name?: string }).name
              return name ? labelOf.get(name) ?? name : ''
            }
          }
        }
      ]
    }),
    [data, labelOf, metric, fmt]
  )

  // Click a node to toggle its filter: investor (by company_id), country, sector.
  const toggle = (key: 'countries' | 'sectors' | 'investors', value: string) => {
    const cur = filters[key]
    const next = cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value]
    setFilters({ [key]: next })
  }
  const onNodeClick = (p: ClickParams) => {
    if (p.dataType !== 'node' || !p.name) return
    const node = data.nodes.find(n => n.name === p.name)
    if (!node) return
    if (node.depth === 0) {
      const id = nameToId.get(node.name)
      if (id) toggle('investors', id) // ignore the "others" bucket (no id)
    } else if (node.depth === 1) {
      toggle('countries', node.name)
    } else {
      toggle('sectors', node.name)
    }
  }

  const countryCount = filters.countries.filter(c => c !== '__none__').length

  if (error) return <div className="p-8 text-sm text-red-700">{error}</div>
  if (loading) return <div className="p-8 text-sm text-gray-600">{t('sankey.loading')}</div>

  const empty = data.links.length === 0

  return (
    <div className="flex h-full w-full flex-col p-6">
      {/* Filter bar: investor / country / sector as dropdowns, metric on the right. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterDropdown label={t('sankey.investors')} count={filters.investors.length}>
          <InvestorFilter
            options={companies}
            selected={filters.investors}
            onChange={ids => setFilters({ investors: ids })}
            metric={metric}
          />
        </FilterDropdown>
        <FilterDropdown label={t('filter.country')} count={countryCount}>
          <CheckList items={countries} selected={filters.countries} onToggle={c => toggle('countries', c)} />
        </FilterDropdown>
        <FilterDropdown label={t('filter.sectors')} count={filters.sectors.length}>
          <CheckList
            items={sectors}
            selected={filters.sectors}
            onToggle={s => toggle('sectors', s)}
            color={sectorColor}
            label={s => t(`sector.${s}`, s)}
          />
        </FilterDropdown>

        <div className="ml-auto flex overflow-hidden rounded border border-gray-300 text-xs">
          {(['count', 'money'] as SankeyMetric[]).map((m, i) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 ${i > 0 ? 'border-l border-gray-300' : ''} ${
                metric === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t(m === 'count' ? 'filter.by_project' : 'filter.by_money')}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 text-[11px] text-gray-400">{t('sankey.click_hint')}</p>

      {/* Chart fills the remaining box height (flex-1 + min-h-0); no page scroll. */}
      <div className="min-h-0 flex-1">
        {empty ? (
          <p className="text-sm text-gray-400">{t('sankey.empty')}</p>
        ) : (
          <ReactECharts
            echarts={echarts}
            option={option}
            style={{ height: '100%', width: '100%' }}
            notMerge
            lazyUpdate
            onEvents={{ click: onNodeClick }}
          />
        )}
      </div>
    </div>
  )
}
