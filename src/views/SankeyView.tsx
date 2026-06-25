import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { Investment } from '@/types/data'
import type { InvestorMap, SankeyMetric } from '@/lib/sankey'
import { buildSankeyData, distinctCompanies, resolveCompanyId } from '@/lib/sankey'
import { sectorColor } from '@/lib/sectors'
import { applyFilters } from '@/lib/filter'
import { useFilters } from '@/hooks/useFilters'
import InvestorFilter from '@/components/InvestorFilter'

// Fallback node colors per depth: investor / country (sector uses sectorColor).
const LEVEL_COLOR = ['#545453', '#377F83', '#0CCABC'] as const
const TOP_N = 20

export default function SankeyView() {
  const { t } = useTranslation()
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

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'sankey',
          draggable: false,
          emphasis: { focus: 'trajectory' },
          data: data.nodes.map(n => ({
            name: n.name,
            depth: n.depth,
            itemStyle: { color: n.depth === 2 ? sectorColor(n.name) : LEVEL_COLOR[n.depth] }
          })),
          links: data.links,
          lineStyle: { color: 'gradient', opacity: 0.25, curveness: 0.5 },
          label: { fontSize: 11, color: '#111' }
        }
      ]
    }),
    [data]
  )

  if (error) return <div className="p-8 text-sm text-red-700">{error}</div>
  if (loading) return <div className="p-8 text-sm text-gray-600">{t('sankey.loading')}</div>

  const empty = data.links.length === 0

  return (
    <div className="flex h-full w-full">
      <InvestorFilter
        options={companies}
        selected={filters.investors}
        onChange={ids => setFilters({ investors: ids })}
        metric={metric}
      />
      <div className="flex min-w-0 flex-1 flex-col p-6">
        <div className="mb-4 flex items-center justify-end gap-4">
          <div className="flex overflow-hidden rounded border border-gray-300 text-xs">
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
        {empty ? (
          <p className="text-sm text-gray-400">{t('sankey.empty')}</p>
        ) : (
          <ReactECharts option={option} style={{ height: '100%', minHeight: 600 }} notMerge lazyUpdate />
        )}
      </div>
    </div>
  )
}
