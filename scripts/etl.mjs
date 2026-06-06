#!/usr/bin/env node
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const DEFAULT_INPUT = resolve(REPO_ROOT, 'data/source/entrega1_inversiones.xlsx')
const DEFAULT_OUTPUT = resolve(REPO_ROOT, 'public/data/investments.json')

const inputPath = process.argv[2] || DEFAULT_INPUT
const outputPath = process.argv[3] || DEFAULT_OUTPUT

const PROJECT_TYPE_CANONICAL = {
  'Adquisición': 'Adquisición',
  'Adquisión': 'Adquisición',
  'Adquisicón': 'Adquisición',
  'Greenfield': 'Greenfield',
  'Construcción': 'Construcción'
}

const VALID_PROJECT_TYPES = new Set(['Adquisición', 'Greenfield', 'Construcción'])

const cleanStr = v => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const titleCase = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const parseCoordinates = s => {
  if (!s) return null
  const parts = String(s).split(',').map(p => p.trim())
  if (parts.length !== 2) return null
  const lat = Number.parseFloat(parts[0])
  const lng = Number.parseFloat(parts[1])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

const parseNumber = v => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const RESEARCH_YES = new Set(['Yes', 'yes', 'YES'])
const RESEARCH_NO = new Set(['No', 'no', 'NO'])

const stats = {
  totalRows: 0,
  rowsKept: 0,
  rowsDroppedNoId: 0,
  rowsDroppedNoCoords: 0,
  rowsDroppedNoProjectType: 0,
  projectTypeTypos: 0,
  areaTrimmed: 0,
  areaCaseFixed: 0,
  researchCitationsRescued: 0,
  researchNullDefaultedNo: 0,
  researchCasesDeduped: 0,
  groupsTotal: 0,
  groupsAsPoint: 0,
  groupsAsLine: 0,
  maxWaypoints: 0,
  vectorOverlayUsed: 0,
  vectorUnresolvedDefaultedToPoint: 0
}

const LEGACY_DATA_DIR = resolve(REPO_ROOT, 'legacy/data')
const buildLegacyVectorOverlay = () => {
  const map = new Map()
  if (!existsSync(LEGACY_DATA_DIR)) return map
  const files = readdirSync(LEGACY_DATA_DIR).filter(f => f.endsWith('.json') && !f.includes('latam') && !f.includes('sankey'))
  for (const f of files) {
    let data
    try { data = JSON.parse(readFileSync(join(LEGACY_DATA_DIR, f), 'utf8')) } catch { continue }
    if (!Array.isArray(data)) continue
    for (const r of data) {
      if (r.Id_Investment === undefined || r.Id_Investment === null) continue
      const key = String(parseInt(String(r.Id_Investment), 10))
      const v = r.Vector
      if (v === 'Punto' || v === 'Vector') {
        const existing = map.get(key)
        if (existing && existing !== v) continue
        map.set(key, v)
      }
    }
  }
  return map
}

const legacyVectorOverlay = buildLegacyVectorOverlay()
console.log(`Legacy vector overlay loaded: ${legacyVectorOverlay.size} ids`)

const resolveVector = (rawVector, rawId) => {
  const idKey = String(parseInt(String(rawId), 10))
  const legacy = legacyVectorOverlay.get(idKey)
  if (legacy) {
    if (rawVector !== legacy) stats.vectorOverlayUsed++
    return legacy
  }
  if (rawVector === 'Punto' || rawVector === 'Vector') return rawVector
  stats.vectorUnresolvedDefaultedToPoint++
  return 'Punto'
}

const sectorMap = new Map()

const cleanRow = row => {
  stats.totalRows++

  const id = cleanStr(row.Id_Investment)
  if (!id) { stats.rowsDroppedNoId++; return null }

  const projectTypeRaw = cleanStr(row.Project_Type)
  if (projectTypeRaw && projectTypeRaw !== PROJECT_TYPE_CANONICAL[projectTypeRaw] && PROJECT_TYPE_CANONICAL[projectTypeRaw]) {
    stats.projectTypeTypos++
  }
  const projectType = projectTypeRaw ? PROJECT_TYPE_CANONICAL[projectTypeRaw] : null
  if (!projectType || !VALID_PROJECT_TYPES.has(projectType)) { stats.rowsDroppedNoProjectType++; return null }

  const coords = parseCoordinates(row.Coordinates)
  if (!coords) { stats.rowsDroppedNoCoords++; return null }

  const rawAreaEn = row.Area_EN ? String(row.Area_EN) : null
  let areaEn = cleanStr(rawAreaEn)
  if (rawAreaEn !== null && rawAreaEn !== rawAreaEn.trim()) stats.areaTrimmed++
  if (areaEn && areaEn[0] !== areaEn[0].toUpperCase()) {
    areaEn = titleCase(areaEn)
    stats.areaCaseFixed++
  }
  const areaEs = cleanStr(row.Area_ES)

  if (areaEn) sectorMap.set(areaEn, (sectorMap.get(areaEn) || 0) + 1)

  const researchRaw = row.Research
  let hasResearch = false
  const inlineCitation = []

  if (researchRaw !== null && researchRaw !== undefined && researchRaw !== '') {
    const s = String(researchRaw).trim()
    if (RESEARCH_YES.has(s)) hasResearch = true
    else if (RESEARCH_NO.has(s)) hasResearch = false
    else if (s.length > 10) {
      inlineCitation.push({ caso: s, link: null })
      hasResearch = true
      stats.researchCitationsRescued++
    }
  } else {
    stats.researchNullDefaultedNo++
  }

  const cases = [...inlineCitation]
  for (let i = 1; i <= 14; i++) {
    const caso = cleanStr(row[`Caso${i}`])
    const link = cleanStr(row[`Link${i}`])
    if (caso) cases.push({ caso, link })
  }
  if (cases.length > 0) hasResearch = true

  const investor = cleanStr(row.Investor) ?? cleanStr(row.investor)
  const jointVentureFlag =
    (row.Joint_Venture ?? row['Joint Venture']) === 'Yes' ||
    (row.Joint_Venture ?? row['Joint Venture']) === 'yes'

  stats.rowsKept++

  return {
    id,
    coords,
    year: parseNumber(row.Year),
    country: cleanStr(row.Country),
    investor,
    area_en: areaEn,
    area_es: areaEs,
    detail_es: cleanStr(row.Detail_ES),
    detail_en: cleanStr(row.Detail_EN),
    investment_musd: parseNumber(row.Investment),
    location: cleanStr(row.Location),
    project_type: projectType,
    is_construction: projectType === 'Construcción',
    is_joint_venture: jointVentureFlag,
    origin_of_seller: cleanStr(row['Origin of seller']),
    stake: parseNumber(row.Stake),
    has_research: hasResearch,
    research_cases: cases,
    vector_raw: row.Vector ?? null,
    vector_resolved: resolveVector(row.Vector, id),
    path_raw: row.Path ?? null
  }
}

console.log(`Reading: ${inputPath}`)
const wb = XLSX.readFile(inputPath)

const totalSheet = wb.Sheets['Total']
if (!totalSheet) { console.error('No "Total" sheet'); process.exit(1) }

const rawRows = XLSX.utils.sheet_to_json(totalSheet, { defval: null })

const cleaned = []
for (const r of rawRows) {
  const c = cleanRow(r)
  if (c) cleaned.push(c)
}

const pointOnlyRows = cleaned.filter(r => r.vector_resolved === 'Punto')
const groupableRows = cleaned.filter(r => r.vector_resolved === 'Vector')

const candidateGroups = new Map()
for (const r of groupableRows) {
  const key = `${r.id}|${r.path_raw ?? ''}`
  if (!candidateGroups.has(key)) candidateGroups.set(key, [])
  candidateGroups.get(key).push(r)
}

const output = []

for (const r of pointOnlyRows) {
  stats.groupsTotal++
  stats.groupsAsPoint++
  output.push({
    id: r.id,
    year: r.year,
    country: r.country,
    investor: r.investor,
    area_en: r.area_en,
    area_es: r.area_es,
    detail_es: r.detail_es,
    detail_en: r.detail_en,
    investment_musd: r.investment_musd,
    location: r.location,
    project_type: r.project_type,
    is_construction: r.is_construction,
    is_joint_venture: r.is_joint_venture,
    origin_of_seller: r.origin_of_seller,
    stake: r.stake,
    has_research: r.has_research,
    research_cases: r.research_cases,
    vector_raw: r.vector_raw,
    geometry_type: 'point',
    coordinates: r.coords
  })
}

for (const [, rows] of candidateGroups) {
  if (rows.length === 1) {
    const r = rows[0]
    stats.groupsTotal++
    stats.groupsAsPoint++
    output.push({
      id: r.id,
      year: r.year,
      country: r.country,
      investor: r.investor,
      area_en: r.area_en,
      area_es: r.area_es,
      detail_es: r.detail_es,
      detail_en: r.detail_en,
      investment_musd: r.investment_musd,
      location: r.location,
      project_type: r.project_type,
      is_construction: r.is_construction,
      is_joint_venture: r.is_joint_venture,
      origin_of_seller: r.origin_of_seller,
      stake: r.stake,
      has_research: r.has_research,
      research_cases: r.research_cases,
      vector_raw: r.vector_raw,
      geometry_type: 'point',
      coordinates: r.coords
    })
    continue
  }

  const id = rows[0].id
  stats.groupsTotal++
  stats.groupsAsLine++
  if (rows.length > stats.maxWaypoints) stats.maxWaypoints = rows.length

  const first = rows[0]
  const mergedCases = []
  const seen = new Set()
  let mergedHasResearch = false
  for (const r of rows) {
    if (r.has_research) mergedHasResearch = true
    for (const c of r.research_cases) {
      // Dedup by study title only. Vector rows often repeat the same citation
      // per waypoint with an Excel drag-filled auto-incrementing link
      // (e.g. .../4211, .../4212, …). Same study → one entry, keep first link.
      const key = c.caso
      if (!seen.has(key)) { seen.add(key); mergedCases.push(c) }
      else stats.researchCasesDeduped++
    }
  }

  output.push({
    id,
    year: first.year,
    country: first.country,
    investor: first.investor,
    area_en: first.area_en,
    area_es: first.area_es,
    detail_es: first.detail_es,
    detail_en: first.detail_en,
    investment_musd: first.investment_musd,
    location: first.location,
    project_type: first.project_type,
    is_construction: first.is_construction,
    is_joint_venture: first.is_joint_venture,
    origin_of_seller: first.origin_of_seller,
    stake: first.stake,
    has_research: mergedHasResearch,
    research_cases: mergedCases,
    vector_raw: first.vector_raw,
    geometry_type: 'line',
    coordinates: rows.map(r => r.coords)
  })
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(output), 'utf8')

console.log('=== ETL stats ===')
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`)
console.log('\n=== Sector distribution (Area_EN) ===')
for (const [k, v] of [...sectorMap.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}
console.log(`\nOutput: ${outputPath}`)
console.log(`File size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`)
