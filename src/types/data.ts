import type { FeatureCollection, Geometry } from 'geojson'

export type CountryProperties = {
  name?: string
  NAME?: string
  iso_a3?: string
  ADM0_A3?: string
}

export type CountryFeatureCollection = FeatureCollection<Geometry, CountryProperties>

export type LocaleCode = 'es' | 'en' | 'cn'

export type ProjectType = 'Adquisición' | 'Greenfield' | 'Construcción'

export type ResearchCase = {
  caso: string
  link: string | null
}

type InvestmentBase = {
  id: string
  year: number | null
  country: string | null
  investor: string | null
  area_en: string | null
  area_es: string | null
  detail_es: string | null
  detail_en: string | null
  investment_musd: number | null
  location: string | null
  project_type: ProjectType
  is_construction: boolean
  is_joint_venture: boolean
  origin_of_seller: string | null
  stake: number | null
  has_research: boolean
  // Split out to research.json (keyed by id) to keep investments.json lean; the map
  // hydrates it after load, so it's absent on freshly-parsed rows (e.g. in the Sankey).
  research_cases?: ResearchCase[]
  vector_raw: string | number | null
}

export type PointInvestment = InvestmentBase & {
  geometry_type: 'point'
  coordinates: [number, number]
}

export type LineInvestment = InvestmentBase & {
  geometry_type: 'line'
  coordinates: [number, number][]
}

export type Investment = PointInvestment | LineInvestment
