import type { Investment } from '@/types/data'

// Test-only factory. Sensible defaults; override per case.
export const makeInv = (over: Partial<Investment> = {}): Investment =>
  ({
    id: '1',
    year: 2020,
    country: 'Brasil',
    investor: 'State Grid',
    area_en: 'Energy',
    area_es: 'Energía',
    detail_es: '',
    detail_en: '',
    investment_musd: 100,
    location: null,
    project_type: 'Greenfield',
    is_construction: false,
    is_joint_venture: false,
    origin_of_seller: null,
    stake: null,
    has_research: false,
    research_cases: [],
    vector_raw: 'Punto',
    geometry_type: 'point',
    coordinates: [0, 0],
    ...over
  }) as Investment
