import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CompanyOption, SankeyMetric } from '@/lib/sankey'

type Props = {
  options: CompanyOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  metric: SankeyMetric
}

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

// Content of the "Inversores" dropdown: search + sort + scrollable list with a
// magnitude bar and value per row.
export default function InvestorFilter({ options, selected, onChange, metric }: Props) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'value'>('name')
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const fmt = useMemo(
    () => new Intl.NumberFormat(i18n.language === 'cn' ? 'zh' : i18n.language, { maximumFractionDigits: 0 }),
    [i18n.language]
  )
  const valueOf = useCallback(
    (o: CompanyOption): number => (metric === 'money' ? o.total : o.count),
    [metric]
  )
  const logMax = useMemo(() => Math.log1p(Math.max(0, ...options.map(valueOf))), [options, valueOf])
  const barPct = (o: CompanyOption): number => {
    const v = valueOf(o)
    return v <= 0 || logMax === 0 ? 0 : (Math.log1p(v) / logMax) * 100
  }

  const filtered = useMemo(() => {
    const base = query ? options.filter(o => norm(o.name).includes(norm(query))) : options
    const sorted = [...base]
    if (sortBy === 'value') sorted.sort((a, b) => valueOf(b) - valueOf(a) || a.name.localeCompare(b.name))
    else sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [options, query, sortBy, valueOf])

  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? selected.filter(x => x !== id) : [...selected, id])

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="border-b border-gray-200 px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('list.search')}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-gray-400">
            {t(metric === 'money' ? 'sankey.unit_money' : 'sankey.unit_count')}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[11px] text-gray-500 underline hover:text-gray-900">
                {t('common.clear')}
              </button>
            )}
            <div className="flex overflow-hidden rounded border border-gray-300 text-[11px]">
              {(['name', 'value'] as const).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-0.5 ${i > 0 ? 'border-l border-gray-300' : ''} ${
                    sortBy === s ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t(s === 'name' ? 'sankey.sort_name' : 'sankey.sort_value')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 && <p className="px-1 py-2 text-xs text-gray-400">{t('list.no_results')}</p>}
        {filtered.map(o => {
          const v = valueOf(o)
          return (
            <label key={o.id} className="flex cursor-pointer flex-col gap-0.5 rounded px-1 py-1 text-sm hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={selectedSet.has(o.id)} onChange={() => toggle(o.id)} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-gray-800" title={o.name}>{o.name}</span>
                <span
                  className="shrink-0 tabular-nums text-xs text-gray-500"
                  title={metric === 'money' ? `US$ ${fmt.format(o.total)} MM` : `${fmt.format(o.count)}`}
                >
                  {v > 0 ? fmt.format(v) : '—'}
                </span>
              </div>
              <div className="ml-6 h-1 rounded bg-gray-100">
                <div className="h-1 rounded bg-teal-500/60" style={{ width: `${barPct(o)}%` }} />
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
