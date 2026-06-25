import type { Investment } from '@/types/data'

export type ResearchFilter = 'all' | 'yes' | 'no'

export type ViewMode = 'cards' | 'map'

export const VIEW_MODES: ViewMode[] = ['cards', 'map']

export type Filters = {
  countries: string[]
  yearMin: number | null
  yearMax: number | null
  types: string[]
  includeConstruction: boolean
  research: ResearchFilter
  sectors: string[]
  view: ViewMode
  query: string
}

export const DEFAULT_FILTERS: Filters = {
  countries: [],
  yearMin: null,
  yearMax: null,
  types: [],
  includeConstruction: true,
  research: 'all',
  sectors: [],
  view: 'cards',
  query: ''
}

const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

const matchesQuery = (inv: Investment, q: string): boolean => {
  if (!q) return true
  const haystack = norm(
    [
      inv.detail_es,
      inv.detail_en,
      inv.investor,
      inv.area_es,
      inv.area_en,
      inv.location,
      inv.project_type,
      inv.origin_of_seller,
      inv.year,
      inv.investment_musd,
      ...inv.research_cases.map(c => c.caso)
    ]
      .filter(v => v !== null && v !== undefined)
      .join(' ')
  )
  return haystack.includes(norm(q))
}

export const applyFilters = (data: Investment[], f: Filters): Investment[] => {
  return data.filter(inv => {
    if (f.countries.length > 0 && (!inv.country || !f.countries.includes(inv.country))) return false
    if (f.yearMin !== null && (inv.year === null || inv.year < f.yearMin)) return false
    if (f.yearMax !== null && (inv.year === null || inv.year > f.yearMax)) return false

    if (inv.project_type === 'Construcción') {
      if (!f.includeConstruction) return false
    } else {
      if (f.types.length > 0 && !f.types.includes(inv.project_type)) return false
    }

    if (f.research === 'yes' && !inv.has_research) return false
    if (f.research === 'no' && inv.has_research) return false

    if (f.sectors.length > 0 && (!inv.area_en || !f.sectors.includes(inv.area_en))) return false

    if (f.query && !matchesQuery(inv, f.query)) return false

    return true
  })
}

export const distinctCountries = (data: Investment[]): string[] =>
  [...new Set(data.map(d => d.country).filter((c): c is string => !!c))].sort()

export const distinctSectors = (data: Investment[]): string[] =>
  [...new Set(data.map(d => d.area_en).filter((s): s is string => !!s))].sort()

export const yearBounds = (data: Investment[]): [number, number] => {
  let min = Infinity
  let max = -Infinity
  for (const d of data) {
    if (d.year === null) continue
    if (d.year < min) min = d.year
    if (d.year > max) max = d.year
  }
  return [min === Infinity ? 2000 : min, max === -Infinity ? new Date().getFullYear() : max]
}
