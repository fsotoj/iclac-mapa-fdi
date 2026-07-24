#!/usr/bin/env node
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonCountry } from './lib/normalize.mjs'
import { validateRows } from './lib/validate.mjs'
import { loadRegistry, loadCountryBorders } from './lib/load_registry.mjs'

const registry = loadRegistry()
const countryBorders = registry ? loadCountryBorders(registry) : null
const canonIndex = registry?.canonIndex

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
  // Overlay legado keyeado por id NUMÉRICO (base vieja). Con los ids nuevos
  // ALPHA3-NNNN el parseInt da NaN → el overlay no aplica y se usa el Vector de
  // la fila (la base por país ya trae Vector limpio). Ver deuda documentada §8.
  const idNum = parseInt(String(rawId), 10)
  const legacy = Number.isNaN(idNum) ? undefined : legacyVectorOverlay.get(String(idNum))
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
    country: canonCountry(row.Country, canonIndex).value ?? null,
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
    // Renombrada a Origin_Of_Seller (v1.2); fallback al nombre viejo por si llega base legada.
    origin_of_seller: cleanStr(row.Origin_Of_Seller) ?? cleanStr(row['Origin of seller']),
    ownership: cleanStr(row.Ownership),
    stake: parseNumber(row.Stake),
    has_research: hasResearch,
    research_cases: cases,
    vector_raw: row.Vector ?? null,
    vector_resolved: resolveVector(row.Vector, id),
    path_raw: row.Path ?? null
  }
}

// Lee las filas de un xlsx. Prefiere la hoja 'Total' (base legada agregada); si
// no existe, usa la primera hoja (flujo por país: 'Datos'/'Sheet1').
const readWorkbook = (file) => {
  const wb = XLSX.readFile(file)
  const sheet = wb.Sheets['Total'] ?? wb.Sheets[wb.SheetNames[0]]
  return { rows: XLSX.utils.sheet_to_json(sheet, { defval: null }), sheetCount: wb.SheetNames.length }
}

let rawRows = []
if (existsSync(inputPath) && statSync(inputPath).isDirectory()) {
  // Flujo por país: un xlsx por país. FILTRO EN BUILD (decisión 23-07): solo
  // ingesta los países cuyo archivo PASA la validación. Así el mapa muestra
  // únicamente países validados; los que fallan se omiten (el informe explica).
  const files = readdirSync(inputPath)
    .filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'))
    .sort()
  const noFilter = process.argv.includes('--no-filter')
  console.log(`Reading dir: ${inputPath} (${files.length} archivos)${noFilter ? ' [sin filtro]' : ''}`)
  for (const f of files) {
    const { rows, sheetCount } = readWorkbook(resolve(inputPath, f))
    if (!noFilter) {
      const { stats } = validateRows(rows, { filename: f, registry, countryBorders, sheetCount })
      if (!stats.passed) {
        console.log(`  ${f}: OMITIDO — no pasa validación (${stats.validPct}% válidas, ${stats.errors} errores)`)
        continue
      }
    }
    console.log(`  ${f}: ${rows.length} filas ✓`)
    rawRows.push(...rows)
  }
} else {
  console.log(`Reading: ${inputPath}`)
  rawRows = readWorkbook(inputPath).rows
}

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
    ownership: r.ownership,
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
    ownership: r.ownership,
      ownership: r.ownership,
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
    ownership: first.ownership,
    stake: first.stake,
    has_research: mergedHasResearch,
    research_cases: mergedCases,
    vector_raw: first.vector_raw,
    geometry_type: 'line',
    coordinates: rows.map(r => r.coords)
  })
}

// Split payload: research_cases is heavy (~13 MB, 71% of the file) and repeats
// across the multi-site rows of each investment. Strip it from investments.json
// (map/sankey never render it) and emit it deduped-by-id in research.json, which
// the Fichas panel / popups load and join on id. See docs/generales/pipeline_datos.md.
const researchById = {}
for (const row of output) {
  if (row.has_research && Array.isArray(row.research_cases) && row.research_cases.length && !researchById[row.id]) {
    researchById[row.id] = row.research_cases
  }
}
const leanOutput = output.map(({ research_cases, ...rest }) => rest)
const researchPath = resolve(dirname(outputPath), 'research.json')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(leanOutput), 'utf8')
writeFileSync(researchPath, JSON.stringify(researchById), 'utf8')
console.log(`Research: ${researchPath} (${Object.keys(researchById).length} investments, ${(JSON.stringify(researchById).length / 1024).toFixed(1)} KB)`)

console.log('=== ETL stats ===')
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`)
console.log('\n=== Sector distribution (Area_EN) ===')
for (const [k, v] of [...sectorMap.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}
console.log(`\nOutput: ${outputPath}`)
console.log(`File size: ${(JSON.stringify(leanOutput).length / 1024).toFixed(1)} KB`)

// --- Investor canonical map: data/schema/investors_map.csv -> investors_map.json ---
// Keyed by investor_raw (the join key). Consumed by the Sankey. Regenerated here
// so it never drifts from the CSV the client maintains.
const investorsCsvPath = resolve(REPO_ROOT, 'data/schema/investors_map.csv')
const investorsJsonPath = resolve(dirname(outputPath), 'investors_map.json')
if (existsSync(investorsCsvPath)) {
  const parseCsvLine = line => {
    const cells = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells
  }
  const csvRows = readFileSync(investorsCsvPath, 'utf8').trim().split(/\r?\n/)
  const header = parseCsvLine(csvRows[0])
  const col = name => header.indexOf(name)
  const [iRaw, iId, iCanon, iCons, iOwn, iMembers] = ['investor_raw', 'company_id', 'company_canonical', 'is_consortium', 'ownership', 'members'].map(col)
  const investorMap = {}
  for (const line of csvRows.slice(1)) {
    const c = parseCsvLine(line)
    const entry = {
      company_id: c[iId],
      company_canonical: c[iCanon],
      ownership: c[iOwn],
      is_consortium: c[iCons] === 'true'
    }
    const members = (c[iMembers] ?? '').split('|').map(s => s.trim()).filter(Boolean)
    if (members.length) entry.members = members
    investorMap[c[iRaw]] = entry
    // También por canónico: la base del cliente usa el nombre canónico como Investor.
    if (c[iCanon] && !(c[iCanon] in investorMap)) investorMap[c[iCanon]] = entry
  }
  writeFileSync(investorsJsonPath, JSON.stringify(investorMap), 'utf8')
  console.log(`Investor map: ${Object.keys(investorMap).length} entries -> ${investorsJsonPath}`)
} else {
  console.warn(`WARN: ${investorsCsvPath} missing — skipped investors_map.json`)
}
