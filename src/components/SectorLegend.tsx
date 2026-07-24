import { useTranslation } from 'react-i18next'
import { useFilters } from '@/hooks/useFilters'
import { sectorColor } from '@/lib/sectors'

type Props = {
  sectors: string[]
}

const toggleInArray = (arr: string[], v: string): string[] =>
  arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export default function SectorLegend({ sectors }: Props) {
  const { t } = useTranslation()
  const { filters, setFilters } = useFilters()

  const isActive = (s: string) => filters.sectors.length === 0 || filters.sectors.includes(s)

  const toggle = (s: string) => {
    const baseline = filters.sectors.length === 0 ? sectors : filters.sectors
    const next = toggleInArray(baseline, s)
    setFilters({ sectors: next.length === sectors.length ? [] : next })
  }

  if (sectors.length === 0) return null

  return (
    <div className="absolute bottom-4 right-4 z-[800] bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-white/50 p-3 max-w-[220px]">
      <div className="text-xs font-bold text-gray-800">{t('filter.sectors')}</div>
      <div className="mb-2 text-[10px] italic text-gray-500">{t('filter.sectors_hint')}</div>
      <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
        {sectors.map(s => {
          const active = isActive(s)
          return (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`flex cursor-pointer items-center gap-2 px-1 py-0.5 rounded text-left hover:bg-gray-100 transition-all ${
                active ? '' : 'opacity-40 grayscale'
              }`}
            >
              <span
                className="inline-block w-4 h-3 rounded-sm border border-gray-300 shrink-0"
                style={{ backgroundColor: sectorColor(s) }}
              />
              <span
                className={`text-[11px] font-medium text-gray-700 truncate ${
                  active ? '' : 'line-through italic text-gray-400'
                }`}
                title={s}
              >
                {t(`sector.${s}`, s)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
