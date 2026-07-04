import { describe, it, expect } from 'vitest'
import { flatList, groupByCountry } from './projectDocs'
import { makeInv } from './testFactory'

describe('groupByCountry sorting', () => {
  const rows = [
    makeInv({ id: 'a', country: 'Chile', year: 2010, investment_musd: 50 }),
    makeInv({ id: 'b', country: 'Chile', year: 2020, investment_musd: null }),
    makeInv({ id: 'c', country: 'Chile', year: 2015, investment_musd: 300 })
  ]

  it('defaults to year desc', () => {
    const [group] = groupByCountry(rows)
    expect(group.projects.map(p => p.id)).toEqual(['b', 'c', 'a'])
  })

  it('amount sorts desc with null amounts last', () => {
    const [group] = groupByCountry(rows, 'amount')
    expect(group.projects.map(p => p.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('flatList', () => {
  it('dedupes by id and sorts globally by amount across countries', () => {
    const rows = [
      makeInv({ id: 'a', country: 'Chile', investment_musd: 50 }),
      makeInv({ id: 'a', country: 'Chile', investment_musd: 50 }), // waypoint repeat
      makeInv({ id: 'b', country: 'Peru', investment_musd: 900 }),
      makeInv({ id: 'c', country: 'Brasil', investment_musd: null })
    ]
    expect(flatList(rows, 'amount').map(p => p.id)).toEqual(['b', 'a', 'c'])
  })
})
