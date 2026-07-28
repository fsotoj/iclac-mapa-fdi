import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFilters } from '@/hooks/useFilters'
import { sectorColor } from '@/lib/sectors'
import BottomSheet from './BottomSheet'

type Props = {
  sectors: string[]
}

const toggleInArray = (arr: string[], v: string): string[] =>
  arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

// Filas de la leyenda: el mismo control en la caja flotante de escritorio y en la
// hoja de móvil. Clic = filtrar; sector apagado va en gris y tachado.
function SectorRows({ sectors, size }: { sectors: string[]; size: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const { filters, setFilters } = useFilters()

  const isActive = (s: string) => filters.sectors.length === 0 || filters.sectors.includes(s)

  const toggle = (s: string) => {
    const baseline = filters.sectors.length === 0 ? sectors : filters.sectors
    const next = toggleInArray(baseline, s)
    setFilters({ sectors: next.length === sectors.length ? [] : next })
  }

  return (
    <>
      {sectors.map(s => {
        const active = isActive(s)
        return (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`flex cursor-pointer items-center gap-2 rounded text-left transition-all hover:bg-brand hover:text-gray-900 ${
              size === 'sm' ? 'px-1 py-0.5' : 'px-2 py-2'
            } ${active ? '' : 'opacity-40 grayscale'}`}
          >
            <span
              className="inline-block h-3 w-4 shrink-0 rounded-sm border border-gray-300"
              style={{ backgroundColor: sectorColor(s) }}
            />
            <span
              className={`font-medium text-gray-700 ${size === 'sm' ? 'truncate text-[11px]' : 'text-sm'} ${
                active ? '' : 'italic text-gray-400 line-through'
              }`}
              title={s}
            >
              {t(`sector.${s}`, s)}
            </span>
          </button>
        )
      })}
    </>
  )
}

// Escritorio: caja flotante sobre la esquina inferior derecha del mapa.
export default function SectorLegend({ sectors }: Props) {
  const { t } = useTranslation()
  if (sectors.length === 0) return null

  return (
    <div className="absolute bottom-4 right-4 z-[800] hidden max-w-[220px] rounded-xl border border-white/50 bg-white/95 p-3 shadow-xl backdrop-blur-md md:block">
      <div className="text-xs font-bold text-gray-800">{t('filter.sectors')}</div>
      <div className="mb-2 text-[10px] italic text-gray-500">{t('filter.sectors_hint')}</div>
      <div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        <SectorRows sectors={sectors} size="sm" />
      </div>
    </div>
  )
}

// Móvil: la misma leyenda como chip en la barra de acciones del mapa. La caja fija
// medía 132×257 px — sobre una pantalla de 360×640 tapaba Brasil entero y, en modo
// agregado, los donuts de Colombia y Venezuela.
export function SectorLegendChip({ sectors }: Props) {
  const { t } = useTranslation()
  const { filters } = useFilters()
  const [open, setOpen] = useState(false)
  if (sectors.length === 0) return null

  const active = filters.sectors.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
          active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'
        }`}
      >
        {t('filter.sectors')}
        {active && <span className="rounded-full bg-white/25 px-1.5 leading-tight">{filters.sectors.length}</span>}
        <span aria-hidden className="text-[9px] opacity-70">▲</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('filter.sectors')}>
        <div className="px-2 pb-4">
          <p className="px-2 py-1 text-[11px] italic text-gray-500">{t('filter.sectors_hint')}</p>
          <div className="flex flex-col">
            <SectorRows sectors={sectors} size="md" />
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
