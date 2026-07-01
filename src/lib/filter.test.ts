import { describe, it, expect } from 'vitest'
import { aggregateInvestments, applyFilters, DEFAULT_FILTERS, type Filters } from './filter'
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
})
