import { describe, it, expect } from 'vitest'
import {
  buildSankeyData,
  distinctCompanies,
  matchesCompany,
  resolveInvestor,
  resolveCompanyId,
  scopeInvestments,
  type CompanyOption,
  type InvestorMap
} from './sankey'
import { makeInv } from './testFactory'

const MAP: InvestorMap = {
  Chemchina: { company_id: 'chemchina', company_canonical: 'ChemChina' },
  ChemChina: { company_id: 'chemchina', company_canonical: 'ChemChina' }
}

// COFCO has own investments AND participates in a consortium; Hopu exists only
// as a member (no standalone row) — mirrors the real map's shape.
const CONS_MAP: InvestorMap = {
  COFCO: { company_id: 'cofco', company_canonical: 'COFCO', ownership: 'SASAC' },
  'COFCO and Hopu Investments': {
    company_id: 'cofco-and-hopu-investments',
    company_canonical: 'COFCO and Hopu Investments',
    ownership: 'MIXED',
    is_consortium: true,
    members: ['cofco', 'hopu-investments']
  },
  'State Grid': { company_id: 'state-grid', company_canonical: 'State Grid', ownership: 'SASAC' },
  Didi: { company_id: 'didi', company_canonical: 'Didi', ownership: 'POE' }
}

const CONS_ROWS = [
  makeInv({ id: 'a', investor: 'COFCO', investment_musd: 10 }),
  makeInv({ id: 'b', investor: 'COFCO and Hopu Investments', investment_musd: 1500 }),
  makeInv({ id: 'c', investor: 'State Grid', investment_musd: 50 }),
  makeInv({ id: 'd', investor: 'Didi', investment_musd: 5 }),
  makeInv({ id: 'e', investor: 'Sin Mapear', investment_musd: 1 })
]

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

  it('resolves consortium member ids to canonical names, humanizing orphan ids', () => {
    const out = distinctCompanies(CONS_ROWS, CONS_MAP)
    const cons = out.find(o => o.id === 'cofco-and-hopu-investments')
    expect(cons?.isConsortium).toBe(true)
    // 'cofco' resolves to its canonical; 'hopu-investments' has no row -> humanized.
    expect(cons?.memberNames).toEqual(['COFCO', 'Hopu Investments'])
    expect(out.find(o => o.id === 'cofco')?.memberNames).toBeUndefined()
  })
})

describe('matchesCompany', () => {
  const cons: CompanyOption = {
    id: 'x',
    name: 'MMG, Guoxin, and CITIC Metal',
    total: 0,
    count: 0,
    isConsortium: true,
    memberNames: ['MMG', 'Guoxin', 'CITIC']
  }
  it('matches canonical name substring (case/accent-insensitive)', () => {
    expect(matchesCompany(cons, 'guoxin')).toBe(true)
    expect(matchesCompany({ ...cons, memberNames: undefined }, 'mmg')).toBe(true)
  })
  it('matches by member canonical name even when absent from the display string', () => {
    const o: CompanyOption = { ...cons, name: 'Consorcio Minero', memberNames: ['CITIC'] }
    expect(matchesCompany(o, 'citic')).toBe(true)
    expect(matchesCompany(o, 'sinopec')).toBe(false)
  })
  it('empty query matches everything', () => {
    expect(matchesCompany(cons, '')).toBe(true)
  })
})

describe('scopeInvestments', () => {
  const all = { investors: [], ownership: [], consortium: 'all' as const }

  it('no restrictions returns everything', () => {
    expect(scopeInvestments(CONS_ROWS, CONS_MAP, all)).toHaveLength(CONS_ROWS.length)
  })

  it('selecting a company keeps its rows AND consortiums it participates in', () => {
    const out = scopeInvestments(CONS_ROWS, CONS_MAP, { ...all, investors: ['cofco'] })
    expect(out.map(i => i.investor).sort()).toEqual(['COFCO', 'COFCO and Hopu Investments'])
  })

  it('selecting a member-only company (no own rows) still surfaces the consortium', () => {
    const out = scopeInvestments(CONS_ROWS, CONS_MAP, { ...all, investors: ['hopu-investments'] })
    expect(out.map(i => i.investor)).toEqual(['COFCO and Hopu Investments'])
  })

  it('filters by ownership, treating unmapped investors as UNKNOWN', () => {
    const poe = scopeInvestments(CONS_ROWS, CONS_MAP, { ...all, ownership: ['POE'] })
    expect(poe.map(i => i.investor)).toEqual(['Didi'])
    const unknown = scopeInvestments(CONS_ROWS, CONS_MAP, { ...all, ownership: ['UNKNOWN'] })
    expect(unknown.map(i => i.investor)).toEqual(['Sin Mapear'])
  })

  it('consortium only / none split the set', () => {
    const only = scopeInvestments(CONS_ROWS, CONS_MAP, { ...all, consortium: 'only' })
    expect(only.map(i => i.investor)).toEqual(['COFCO and Hopu Investments'])
    const none = scopeInvestments(CONS_ROWS, CONS_MAP, { ...all, consortium: 'none' })
    expect(none).toHaveLength(CONS_ROWS.length - 1)
  })

  it('combines dimensions (AND semantics)', () => {
    const out = scopeInvestments(CONS_ROWS, CONS_MAP, {
      investors: ['cofco'],
      ownership: ['SASAC'],
      consortium: 'none'
    })
    expect(out.map(i => i.investor)).toEqual(['COFCO'])
  })
})
