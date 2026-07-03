import type { Investment } from '@/types/data'
import { dedupeById } from './projectDocs'

export type SankeyMetric = 'count' | 'money'

// One entry per raw investor string (the join key from investments.json).
export type InvestorMapEntry = {
  company_id: string
  company_canonical: string
  ownership?: string
  is_consortium?: boolean
  // Consortium constituents as company_ids (only present on consortium entries).
  members?: string[]
}
export type InvestorMap = Record<string, InvestorMapEntry>

export type SankeyNode = { name: string; depth: 0 | 1 | 2 }
export type SankeyLink = { source: string; target: string; value: number }
export type SankeyData = { nodes: SankeyNode[]; links: SankeyLink[] }

export type BuildOpts = {
  metric: SankeyMetric
  topN: number
  // Distinct labels per column so the "fallback" buckets never collapse into one
  // node — ECharts sankey requires globally-unique node names across depths.
  othersInvestor?: string
  noCountry?: string
  noSector?: string
}

// Separator for composite map keys. A control char can't appear in a name, so
// splitting on it is safe even when names contain spaces.
const SEP = String.fromCharCode(1)

// Resolve a raw investor string to its canonical company name (falls back to raw
// when unmapped — a new/unmapped name still renders instead of vanishing).
export const resolveInvestor = (raw: string, map: InvestorMap): string =>
  map[raw]?.company_canonical ?? raw

// Stable, URL-safe id for the investor filter. Falls back to the raw name.
export const resolveCompanyId = (raw: string, map: InvestorMap): string =>
  map[raw]?.company_id ?? raw

export type CompanyOption = {
  id: string
  name: string
  total: number
  count: number
  isConsortium?: boolean
  // Canonical names of consortium members, for member-aware search.
  memberNames?: string[]
}

// company_id -> canonical name, for resolving consortium member ids. Members
// merged into a parent (or without a standalone row) fall back to their id.
const companyNameIndex = (map: InvestorMap): Map<string, string> => {
  const index = new Map<string, string>()
  for (const entry of Object.values(map)) {
    if (!index.has(entry.company_id)) index.set(entry.company_id, entry.company_canonical)
  }
  return index
}

// Humanize a member id that has no standalone row ("hopu-investments" ->
// "Hopu Investments"); very short tokens read as acronyms ("mmg" -> "MMG").
const humanizeId = (id: string): string =>
  id
    .split('-')
    .map(w => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')

const memberNamesOf = (entry: InvestorMapEntry | undefined, index: Map<string, string>): string[] | undefined =>
  entry?.members?.length ? entry.members.map(id => index.get(id) ?? humanizeId(id)) : undefined

// Distinct canonical companies for the investor filter, sorted alphabetically.
// `total` = Σ money (MM), `count` = number of investments (both deduped by id).
export const distinctCompanies = (investments: Investment[], map: InvestorMap): CompanyOption[] => {
  const index = companyNameIndex(map)
  const byId = new Map<string, CompanyOption>()
  for (const inv of dedupeById(investments)) {
    const raw = inv.investor ?? ''
    if (!raw) continue
    const id = resolveCompanyId(raw, map)
    const existing = byId.get(id)
    if (existing) {
      existing.total += inv.investment_musd ?? 0
      existing.count += 1
    } else {
      const entry = map[raw]
      byId.set(id, {
        id,
        name: resolveInvestor(raw, map),
        total: inv.investment_musd ?? 0,
        count: 1,
        isConsortium: entry?.is_consortium || undefined,
        memberNames: memberNamesOf(entry, index)
      })
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const normName = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

// Search predicate for the investor filter: matches the canonical name or any
// consortium member's canonical name (so a company buried mid-consortium is found).
export const matchesCompany = (o: CompanyOption, query: string): boolean => {
  const q = normName(query)
  if (!q) return true
  if (normName(o.name).includes(q)) return true
  return o.memberNames?.some(m => normName(m).includes(q)) ?? false
}

export type ConsortiumMode = 'all' | 'only' | 'none'

export type ScopeOpts = {
  // company_ids; empty = no investor restriction.
  investors: string[]
  // ownership values (SASAC/SOE/POE/MIXED/UNKNOWN); empty = no restriction.
  ownership: string[]
  consortium: ConsortiumMode
}

// Sankey-only scoping of investments by the investor-map dimensions. Selecting
// a company also keeps consortiums it participates in (as their own node — the
// amount stays on the consortium, never re-attributed to members).
export function scopeInvestments(
  investments: Investment[],
  map: InvestorMap,
  { investors, ownership, consortium }: ScopeOpts
): Investment[] {
  const invSet = new Set(investors)
  const ownSet = new Set(ownership)
  return investments.filter(inv => {
    const raw = inv.investor ?? ''
    const entry = map[raw]
    const isConsortium = entry?.is_consortium ?? false
    if (consortium === 'only' && !isConsortium) return false
    if (consortium === 'none' && isConsortium) return false
    if (ownSet.size && !ownSet.has(entry?.ownership || 'UNKNOWN')) return false
    if (invSet.size) {
      const direct = invSet.has(resolveCompanyId(raw, map))
      const viaMember = isConsortium && (entry?.members?.some(m => invSet.has(m)) ?? false)
      if (!direct && !viaMember) return false
    }
    return true
  })
}

const weightOf = (inv: Investment, metric: SankeyMetric): number =>
  metric === 'money' ? inv.investment_musd ?? 0 : 1

// Build Investor -> Country -> Sector flows from raw investments.
// - Dedup by id first (multi-location rows repeat one investment; see memory).
// - Investors resolved to canonical company, then truncated to top-N by metric;
//   the tail collapses into an "others" node.
// - Two link sets: investor->country and country->sector.
export function buildSankeyData(
  investments: Investment[],
  map: InvestorMap,
  opts: BuildOpts
): SankeyData {
  const {
    metric,
    topN,
    othersInvestor = 'Otros',
    noCountry = 'Sin país',
    noSector = 'Sin sector'
  } = opts

  const unique = dedupeById(investments)

  // Rank canonical investors by metric -> keep top-N.
  const byInvestor = new Map<string, number>()
  for (const inv of unique) {
    const name = resolveInvestor(inv.investor ?? othersInvestor, map)
    byInvestor.set(name, (byInvestor.get(name) ?? 0) + weightOf(inv, metric))
  }
  const top = new Set(
    [...byInvestor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([n]) => n)
  )

  const investorCountry = new Map<string, number>()
  const countrySector = new Map<string, number>()
  const investors = new Set<string>()
  const countries = new Set<string>()
  const sectors = new Set<string>()

  for (const inv of unique) {
    const canonical = resolveInvestor(inv.investor ?? othersInvestor, map)
    const investor = top.has(canonical) ? canonical : othersInvestor
    const country = inv.country ?? noCountry
    const sector = inv.area_en ?? noSector
    const w = weightOf(inv, metric)

    investors.add(investor)
    countries.add(country)
    sectors.add(sector)

    const k1 = investor + SEP + country
    const k2 = country + SEP + sector
    investorCountry.set(k1, (investorCountry.get(k1) ?? 0) + w)
    countrySector.set(k2, (countrySector.get(k2) ?? 0) + w)
  }

  const nodes: SankeyNode[] = [
    ...[...investors].map((name): SankeyNode => ({ name, depth: 0 })),
    ...[...countries].map((name): SankeyNode => ({ name, depth: 1 })),
    ...[...sectors].map((name): SankeyNode => ({ name, depth: 2 }))
  ]

  const toLink = ([k, value]: [string, number]): SankeyLink => {
    const [source, target] = k.split(SEP)
    return { source, target, value }
  }
  const links: SankeyLink[] = [
    ...[...investorCountry].map(toLink),
    ...[...countrySector].map(toLink)
  ]

  return { nodes, links }
}
