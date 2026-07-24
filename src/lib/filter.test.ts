import { describe, it, expect } from 'vitest'
import { activeFilterCount, aggregateInvestments, applyFilters, DEFAULT_FILTERS, type Filters } from './filter'
import type { InvestorMap } from './sankey'
import { makeInv } from './testFactory'

const withFilters = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over })

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

  it('empty filters keep everything', () => {
    expect(applyFilters(rows, DEFAULT_FILTERS)).toHaveLength(3)
  })

  it('filters by country', () => {
    expect(applyFilters(rows, withFilters({ countries: ['Brasil'] })).map(r => r.id)).toEqual(['a', 'c'])
  })

  it('filters by year range', () => {
    expect(applyFilters(rows, withFilters({ yearMin: 2005, yearMax: 2021 })).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('excludes construction when includeConstruction is false', () => {
    const out = applyFilters(rows, withFilters({ includeConstruction: false }))
    expect(out.map(r => r.id)).toEqual(['a', 'b'])
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
      expect(activeFilterCount(withFilters({ focusId: 'a' }))).toBe(1)
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
  it('is zero for the default filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
  })

  it('counts each non-default dimension once, ignoring view/pie*', () => {
    const f = withFilters({
      countries: ['Brasil'],
      sectors: ['Energy'],
      view: 'cards',
      pieByCountry: true,
      pieMetric: 'money'
    })
    expect(activeFilterCount(f)).toBe(2)
  })

  it('counts investor-map dimensions', () => {
    expect(activeFilterCount(withFilters({ investors: ['cofco'], ownership: ['POE'] }))).toBe(2)
  })
})
