import type { Investment } from '@/types/data'
import { scopeInvestments, type InvestorMap } from './sankey'

export type ResearchFilter = 'all' | 'yes' | 'no'

// Construction is its own dimension, not a value of `types`: the methodology counts
// these projects apart from FDI. Three states because two were not enough — excluding
// and including left no way to look at the construction projects on their own.
export type ConstructionFilter = 'exclude' | 'include' | 'only'

export const CONSTRUCTION_FILTERS: ConstructionFilter[] = ['exclude', 'include', 'only']

// 'map' = list closed; 'cards' / 'table' = list open in that format.
export type ViewMode = 'cards' | 'table' | 'map'

export const VIEW_MODES: ViewMode[] = ['cards', 'table', 'map']

export type PieMetric = 'count' | 'money'

export const PIE_METRICS: PieMetric[] = ['count', 'money']

export type Filters = {
  countries: string[]
  yearMin: number | null
  yearMax: number | null
  types: string[]
  construction: ConstructionFilter
  research: ResearchFilter
  sectors: string[]
  view: ViewMode
  pieByCountry: boolean
  pieMetric: PieMetric
  query: string
  // Investor-map dimensions (selected company_ids, ownership values). Applied
  // only when applyFilters receives the canonical map — callers without it
  // (tests, legacy paths) keep the investment-only behavior.
  investors: string[]
  ownership: string[]
  // Isolate a single investment (card action). When set, applyFilters returns
  // every row of that id (full multi-point/line geometry) and IGNORES all other
  // filters — isolation must always show the investment.
  focusId: string | null
}

export const DEFAULT_FILTERS: Filters = {
  countries: [],
  yearMin: null,
  yearMax: null,
  types: [],
  // Excluded by default (UAT S3 point 2): construction is not FDI under the published
  // methodology, so the headline total must leave it out unless asked otherwise.
  construction: 'exclude',
  research: 'all',
  sectors: [],
  // List open by default (Margareth UAT): the "Listado de inversiones" is too
  // hidden otherwise. Opens as a table (more rows visible at once). On phones
  // MapView still starts it closed so the panel doesn't cover the map on load.
  view: 'table',
  pieByCountry: false,
  pieMetric: 'count',
  query: '',
  investors: [],
  ownership: [],
  focusId: null
}

// Counts data-filtering dimensions that differ from default — ignores view/pie*,
// which are presentation choices, not filters. Used to show "clear filters" only
// when there is something to clear.
export const activeFilterCount = (f: Filters): number =>
  [
    f.countries.length > 0,
    f.yearMin !== null || f.yearMax !== null,
    f.types.length > 0,
    // Compared against the default: with construction excluded by default, it is
    // asking for it (include / only) that counts as an active filter.
    f.construction !== DEFAULT_FILTERS.construction,
    f.research !== 'all',
    f.sectors.length > 0,
    f.query !== '',
    f.investors.length > 0,
    f.ownership.length > 0,
    f.focusId !== null
  ].filter(Boolean).length

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
      ...(inv.research_cases ?? []).map(c => c.caso)
    ]
      .filter(v => v !== null && v !== undefined)
      .join(' ')
  )
  return haystack.includes(norm(q))
}

export const applyFilters = (data: Investment[], f: Filters, map?: InvestorMap): Investment[] => {
  // Isolation wins over everything: always show the focused investment whole.
  if (f.focusId !== null) return data.filter(inv => inv.id === f.focusId)
  const base = data.filter(inv => {
    if (f.countries.length > 0 && (!inv.country || !f.countries.includes(inv.country))) return false
    if (f.yearMin !== null && (inv.year === null || inv.year < f.yearMin)) return false
    if (f.yearMax !== null && (inv.year === null || inv.year > f.yearMax)) return false

    if (inv.project_type === 'Construcción') {
      if (f.construction === 'exclude') return false
    } else {
      // 'only' drops everything that is not construction; the type filter never
      // governs construction rows, they answer to their own control.
      if (f.construction === 'only') return false
      if (f.types.length > 0 && !f.types.includes(inv.project_type)) return false
    }

    if (f.research === 'yes' && !inv.has_research) return false
    if (f.research === 'no' && inv.has_research) return false

    if (f.sectors.length > 0 && (!inv.area_en || !f.sectors.includes(inv.area_en))) return false

    if (f.query && !matchesQuery(inv, f.query)) return false

    return true
  })
  // Investor-map dimensions need the canonical map to resolve raw names.
  if (!map) return base
  return scopeInvestments(base, map, {
    investors: f.investors,
    ownership: f.ownership
  })
}

export type InvestmentAggregate = {
  count: number // distinct investments (by Id_Investment)
  totalMusd: number // Σ amount, one per investment (millones USD)
  withoutAmount: number // distinct investments with null amount
}

// One Id_Investment can explode into many rows/markers (multi-location "Punto"
// rows, line waypoints) that all repeat the same amount. Dedup by id for the
// real count and the real money total. See memory: investment_amount_dedup.
export const aggregateInvestments = (data: Investment[]): InvestmentAggregate => {
  const amountById = new Map<string, number | null>()
  for (const inv of data) {
    if (!amountById.has(inv.id)) amountById.set(inv.id, inv.investment_musd)
    else if (amountById.get(inv.id) == null && inv.investment_musd != null) {
      amountById.set(inv.id, inv.investment_musd)
    }
  }
  let totalMusd = 0
  let withoutAmount = 0
  for (const amt of amountById.values()) {
    if (amt == null) withoutAmount++
    else totalMusd += amt
  }
  return { count: amountById.size, totalMusd, withoutAmount }
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
