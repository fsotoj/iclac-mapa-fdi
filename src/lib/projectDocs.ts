import type { Investment } from '@/types/data'
import i18n from '@/i18n'

export type CountryGroup = {
  country: string
  projects: Investment[]
}

/** Multi-point investments repeat full rows per coordinate — keep first per id. */
export const dedupeById = (invs: Investment[]): Investment[] => {
  const seen = new Set<string>()
  const out: Investment[] = []
  for (const inv of invs) {
    if (seen.has(inv.id)) continue
    seen.add(inv.id)
    out.push(inv)
  }
  return out
}

export type CardSort = 'year' | 'amount'

// year: desc, missing years last. amount: desc, missing amounts last —
// a null amount is "unknown", not zero, so it never outranks a real value.
const compareBy = (sortBy: CardSort) => (a: Investment, b: Investment): number => {
  if (sortBy === 'amount') {
    const av = a.investment_musd
    const bv = b.investment_musd
    if (av === null && bv === null) return (b.year ?? 0) - (a.year ?? 0)
    if (av === null) return 1
    if (bv === null) return -1
    return bv - av
  }
  return (b.year ?? 0) - (a.year ?? 0)
}

/** Group deduped investments by country, projects sorted by `sortBy`, countries A→Z. */
export const groupByCountry = (invs: Investment[], sortBy: CardSort = 'year'): CountryGroup[] => {
  const byCountry = new Map<string, Investment[]>()
  for (const inv of dedupeById(invs)) {
    const country = inv.country ?? '—'
    const bucket = byCountry.get(country)
    if (bucket) bucket.push(inv)
    else byCountry.set(country, [inv])
  }
  return [...byCountry.entries()]
    .map(([country, projects]) => ({
      country,
      projects: projects.sort(compareBy(sortBy))
    }))
    .sort((a, b) => a.country.localeCompare(b.country))
}

/** Deduped flat list (no country grouping), globally sorted by `sortBy`. */
export const flatList = (invs: Investment[], sortBy: CardSort = 'year'): Investment[] =>
  dedupeById(invs).sort(compareBy(sortBy))

type Lang = string

export const localizedDetail = (inv: Investment, lang: Lang): string =>
  (lang.startsWith('en') ? inv.detail_en ?? inv.detail_es : inv.detail_es ?? inv.detail_en) ?? '—'

export const localizedArea = (inv: Investment, lang: Lang): string =>
  i18n.t(`sector.${inv.area_en}`, { lng: lang, defaultValue: inv.area_en ?? inv.area_es ?? '' })

export const formatMoney = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US')
