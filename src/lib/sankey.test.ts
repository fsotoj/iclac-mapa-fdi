import { describe, it, expect } from 'vitest'
import { buildSankeyData, distinctCompanies, resolveInvestor, resolveCompanyId, type InvestorMap } from './sankey'
import { makeInv } from './testFactory'

const MAP: InvestorMap = {
  Chemchina: { company_id: 'chemchina', company_canonical: 'ChemChina' },
  ChemChina: { company_id: 'chemchina', company_canonical: 'ChemChina' }
}

describe('resolveInvestor / resolveCompanyId', () => {
  it('resolves raw name to canonical via map', () => {
    expect(resolveInvestor('Chemchina', MAP)).toBe('ChemChina')
    expect(resolveCompanyId('Chemchina', MAP)).toBe('chemchina')
  })
  it('falls back to raw when unmapped', () => {
    expect(resolveInvestor('Unknown Co', MAP)).toBe('Unknown Co')
    expect(resolveCompanyId('Unknown Co', MAP)).toBe('Unknown Co')
  })
})

describe('buildSankeyData', () => {
  const opts = { metric: 'money' as const, topN: 20, othersInvestor: 'Otros' }

  it('builds investor→country and country→sector links', () => {
    const { nodes, links } = buildSankeyData([makeInv()], MAP, opts)
    expect(links).toContainEqual({ source: 'State Grid', target: 'Brasil', value: 100 })
    expect(links).toContainEqual({ source: 'Brasil', target: 'Energy', value: 100 })
    expect(nodes.find(n => n.name === 'State Grid')?.depth).toBe(0)
    expect(nodes.find(n => n.name === 'Brasil')?.depth).toBe(1)
    expect(nodes.find(n => n.name === 'Energy')?.depth).toBe(2)
  })

  it('dedupes by id — repeated rows do not inflate money or count', () => {
    const rows = [makeInv({ id: 'a' }), makeInv({ id: 'a' })]
    const money = buildSankeyData(rows, MAP, opts)
    expect(money.links.find(l => l.source === 'State Grid')?.value).toBe(100)
    const count = buildSankeyData(rows, MAP, { ...opts, metric: 'count' })
    expect(count.links.find(l => l.source === 'State Grid')?.value).toBe(1)
  })

  it('count metric weighs each investment as 1', () => {
    const rows = [makeInv({ id: 'a' }), makeInv({ id: 'b' })]
    const { links } = buildSankeyData(rows, MAP, { ...opts, metric: 'count' })
    expect(links.find(l => l.source === 'State Grid')?.value).toBe(2)
  })

  it('collapses the tail beyond topN into the others bucket', () => {
    const rows = [
      makeInv({ id: 'a', investor: 'A', investment_musd: 30 }),
      makeInv({ id: 'b', investor: 'B', investment_musd: 20 }),
      makeInv({ id: 'c', investor: 'C', investment_musd: 10 })
    ]
    const { nodes, links } = buildSankeyData(rows, MAP, { ...opts, topN: 2 })
    const investorNames = nodes.filter(n => n.depth === 0).map(n => n.name).sort()
    expect(investorNames).toEqual(['A', 'B', 'Otros'])
    expect(links.find(l => l.source === 'Otros')?.value).toBe(10)
  })

  it('canonicalizes investors before ranking (variants merge)', () => {
    const rows = [
      makeInv({ id: 'a', investor: 'Chemchina', investment_musd: 5 }),
      makeInv({ id: 'b', investor: 'ChemChina', investment_musd: 7 })
    ]
    const { nodes, links } = buildSankeyData(rows, MAP, opts)
    expect(nodes.filter(n => n.name === 'ChemChina')).toHaveLength(1)
    expect(links.find(l => l.source === 'ChemChina')?.value).toBe(12)
  })

  it('uses distinct fallback labels per column (no cross-depth node collision)', () => {
    const rows = [makeInv({ id: 'a', investor: 'X', country: null, area_en: null })]
    const { nodes } = buildSankeyData(rows, MAP, { ...opts, topN: 0 })
    const names = nodes.map(n => n.name)
    // Investor→"Otros" (topN 0), country→"Sin país", sector→"Sin sector": all distinct.
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Otros')
    expect(names).toContain('Sin país')
    expect(names).toContain('Sin sector')
  })
})

describe('distinctCompanies', () => {
  it('dedupes by id and aggregates total + count per canonical company', () => {
    const rows = [
      makeInv({ id: 'a', investor: 'Chemchina', investment_musd: 5 }),
      makeInv({ id: 'b', investor: 'ChemChina', investment_musd: 7 })
    ]
    const out = distinctCompanies(rows, MAP)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'chemchina', name: 'ChemChina', total: 12, count: 2 })
  })
})
