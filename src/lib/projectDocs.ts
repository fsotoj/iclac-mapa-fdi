import type { Investment } from '@/types/data'

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

/** Group deduped investments by country, projects sorted by year desc, countries A→Z. */
export const groupByCountry = (invs: Investment[]): CountryGroup[] => {
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
      projects: projects.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    }))
    .sort((a, b) => a.country.localeCompare(b.country))
}

type Lang = string

export const localizedDetail = (inv: Investment, lang: Lang): string =>
  (lang.startsWith('en') ? inv.detail_en ?? inv.detail_es : inv.detail_es ?? inv.detail_en) ?? '—'

export const localizedArea = (inv: Investment, lang: Lang): string =>
  (lang.startsWith('en') ? inv.area_en ?? inv.area_es : inv.area_es ?? inv.area_en) ?? ''

export const formatMoney = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US')
