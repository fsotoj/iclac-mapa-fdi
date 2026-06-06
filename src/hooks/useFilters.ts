import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_FILTERS, VIEW_MODES, type Filters, type ResearchFilter, type ViewMode } from '@/lib/filter'

const splitCsv = (s: string | null): string[] =>
  s ? s.split(',').map(p => p.trim()).filter(Boolean) : []

const joinCsv = (a: string[]): string => a.join(',')

export const useFilters = (): { filters: Filters; setFilters: (next: Partial<Filters>) => void; reset: () => void } => {
  const [params, setParams] = useSearchParams()

  const filters = useMemo<Filters>(() => {
    const yMin = params.get('yMin')
    const yMax = params.get('yMax')
    const research = (params.get('r') as ResearchFilter | null) ?? DEFAULT_FILTERS.research
    const view = (params.get('view') as ViewMode | null) ?? DEFAULT_FILTERS.view
    return {
      countries: splitCsv(params.get('p')),
      yearMin: yMin ? Number.parseInt(yMin, 10) : null,
      yearMax: yMax ? Number.parseInt(yMax, 10) : null,
      types: splitCsv(params.get('t')),
      includeConstruction: params.get('c') !== '0',
      research: ['all', 'yes', 'no'].includes(research) ? research : 'all',
      sectors: splitCsv(params.get('s')),
      view: VIEW_MODES.includes(view) ? view : DEFAULT_FILTERS.view
    }
  }, [params])

  const setFilters = useCallback(
    (next: Partial<Filters>) => {
      const merged = { ...filters, ...next }
      const sp = new URLSearchParams()
      if (merged.countries.length) sp.set('p', joinCsv(merged.countries))
      if (merged.yearMin !== null) sp.set('yMin', String(merged.yearMin))
      if (merged.yearMax !== null) sp.set('yMax', String(merged.yearMax))
      if (merged.types.length) sp.set('t', joinCsv(merged.types))
      if (!merged.includeConstruction) sp.set('c', '0')
      if (merged.research !== 'all') sp.set('r', merged.research)
      if (merged.sectors.length) sp.set('s', joinCsv(merged.sectors))
      if (merged.view !== DEFAULT_FILTERS.view) sp.set('view', merged.view)
      setParams(sp, { replace: true })
    },
    [filters, setParams]
  )

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])

  return { filters, setFilters, reset }
}
