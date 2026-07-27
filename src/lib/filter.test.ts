import { describe, it, expect } from 'vitest'
import { activeFilterCount, aggregateInvestments, applyFilters, DEFAULT_FILTERS, type Filters } from './filter'
import type { InvestorMap } from './sankey'
import { makeInv } from './testFactory'

// Construction is included here so each test exercises the dimension it is about:
// with the real default ('exclude') every fixture row of type 'Construcción' would
// vanish from unrelated assertions. The default has its own tests below.
const withFilters = (over: Partial<Filters>): Filters => ({
  ...DEFAULT_FILTERS,
  construction: 'include',
  ...over
})

describe('aggregateInvestments', () => {
  it('dedupes money + count by id, tracks amounts missing', () => {
    const rows = [
      makeInv({ id: 'a', investment_musd: 100 }),
      makeInv({ id: 'a', investment_musd: 100 }), // repeat → not double counted
      makeInv({ id: 'b', investment_musd: null })
    ]
    const agg = aggregateInvestments(rows)
    expect(agg.count).toBe(2)
    expect(agg.totalMusd).toBe(100)
    expect(agg.withoutAmount).toBe(1)
  })

  it('recovers an amount from a later row of the same id', () => {
    const rows = [makeInv({ id: 'a', investment_musd: null }), makeInv({ id: 'a', investment_musd: 50 })]
    expect(aggregateInvestments(rows).totalMusd).toBe(50)
  })
})

describe('applyFilters', () => {
  const rows = [
    makeInv({ id: 'a', country: 'Brasil', year: 2020, area_en: 'Energy', project_type: 'Greenfield', has_research: true }),
    makeInv({ id: 'b', country: 'Argentina', year: 2010, area_en: 'Mining', project_type: 'Adquisición', has_research: false }),
    makeInv({ id: 'c', country: 'Brasil', year: 2000, area_en: 'Energy', project_type: 'Construcción', has_research: false })
  ]

  it('default filters drop construction, keep the rest', () => {
    expect(applyFilters(rows, DEFAULT_FILTERS).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('keeps everything once construction is opted in', () => {
    expect(applyFilters(rows, withFilters({}))).toHaveLength(3)
  })

  it('filters by country', () => {
    expect(applyFilters(rows, withFilters({ countries: ['Brasil'] })).map(r => r.id)).toEqual(['a', 'c'])
  })

  it('filters by year range', () => {
    expect(applyFilters(rows, withFilters({ yearMin: 2005, yearMax: 2021 })).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('excludes construction when set to exclude', () => {
    const out = applyFilters(rows, withFilters({ construction: 'exclude' }))
    expect(out.map(r => r.id)).toEqual(['a', 'b'])
  })

  it('shows construction alone when set to only', () => {
    const out = applyFilters(rows, withFilters({ construction: 'only' }))
    expect(out.map(r => r.id)).toEqual(['c'])
  })

  it('only ignores the type filter (construction answers to its own control)', () => {
    const out = applyFilters(rows, withFilters({ construction: 'only', types: ['Greenfield'] }))
    expect(out.map(r => r.id)).toEqual(['c'])
  })

  it('type filter does not drop construction rows (governed by its own flag)', () => {
    const out = applyFilters(rows, withFilters({ types: ['Greenfield'] }))
    expect(out.map(r => r.id).sort()).toEqual(['a', 'c'])
  })

  it('filters by research presence', () => {
    expect(applyFilters(rows, withFilters({ research: 'yes' })).map(r => r.id)).toEqual(['a'])
    expect(applyFilters(rows, withFilters({ research: 'no' })).map(r => r.id)).toEqual(['b', 'c'])
  })

  it('filters by sector (area_en)', () => {
    expect(applyFilters(rows, withFilters({ sectors: ['Mining'] })).map(r => r.id)).toEqual(['b'])
  })

  it('filters by query (accent-insensitive, matches investor)', () => {
    const q = [makeInv({ id: 'x', investor: 'Sinopec' }), makeInv({ id: 'y', investor: 'Huawei' })]
    expect(applyFilters(q, withFilters({ query: 'sino' })).map(r => r.id)).toEqual(['x'])
  })

  describe('focusId (single-investment isolation)', () => {
    it('returns every row of the focused id, ignoring all other filters', () => {
      const multi = [
        makeInv({ id: 'a', country: 'Brasil', year: 2020 }),
        makeInv({ id: 'a', country: 'Brasil', year: 2020 }), // second waypoint row
        makeInv({ id: 'b', country: 'Argentina', year: 2010 })
      ]
      // Filters that would exclude 'a' — isolation must win.
      const out = applyFilters(multi, withFilters({ focusId: 'a', countries: ['Argentina'], yearMin: 2021 }))
      expect(out.map(r => r.id)).toEqual(['a', 'a'])
    })

    it('counts as an active filter', () => {
      expect(activeFilterCount({ ...DEFAULT_FILTERS, focusId: 'a' })).toBe(1)
    })
  })

  describe('with the investor map (third argument)', () => {
    const MAP: InvestorMap = {
      COFCO: { company_id: 'cofco', company_canonical: 'COFCO', ownership: 'SASAC' },
      'COFCO and Hopu Investments': {
        company_id: 'cofco-and-hopu-investments',
        company_canonical: 'COFCO and Hopu Investments',
        ownership: 'MIXED',
        is_consortium: true,
        members: ['cofco', 'hopu-investments']
      },
      Didi: { company_id: 'didi', company_canonical: 'Didi', ownership: 'POE' }
    }
    const rows = [
      makeInv({ id: 'a', investor: 'COFCO' }),
      makeInv({ id: 'b', investor: 'COFCO and Hopu Investments' }),
      makeInv({ id: 'c', investor: 'Didi' }),
      makeInv({ id: 'd', investor: 'Sin Mapear' })
    ]

    it('without the map, investor dimensions are ignored (legacy behavior)', () => {
      expect(applyFilters(rows, withFilters({ investors: ['cofco'], ownership: ['POE'] }))).toHaveLength(4)
    })

    it('selecting a company keeps its rows and consortiums it participates in', () => {
      const out = applyFilters(rows, withFilters({ investors: ['cofco'] }), MAP)
      expect(out.map(r => r.id)).toEqual(['a', 'b'])
    })

    it('ownership filter treats unmapped investors as UNKNOWN', () => {
      expect(applyFilters(rows, withFilters({ ownership: ['UNKNOWN'] }), MAP).map(r => r.id)).toEqual(['d'])
    })

    it('ownership filter drops the consortium row (MIXED), composing with other filters', () => {
      const out = applyFilters(rows, withFilters({ ownership: ['SASAC'] }), MAP)
      expect(out.map(r => r.id)).toEqual(['a'])
    })
  })
})

describe('activeFilterCount', () => {
  // Counted against DEFAULT_FILTERS, not the construction-on helper above.
  const fromDefaults = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over })

  it('is zero for the default filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
  })

  it('counts each non-default dimension once, ignoring view/pie*', () => {
    const f = fromDefaults({
      countries: ['Brasil'],
      sectors: ['Energy'],
      view: 'cards',
      pieByCountry: true,
      pieMetric: 'money'
    })
    expect(activeFilterCount(f)).toBe(2)
  })

  it('counts investor-map dimensions', () => {
    expect(activeFilterCount(fromDefaults({ investors: ['cofco'], ownership: ['POE'] }))).toBe(2)
  })

  it('counts asking for construction as the deviation, not excluding it', () => {
    expect(activeFilterCount(fromDefaults({ construction: 'include' }))).toBe(1)
    expect(activeFilterCount(fromDefaults({ construction: 'only' }))).toBe(1)
    expect(activeFilterCount(fromDefaults({ construction: 'exclude' }))).toBe(0)
  })
})
