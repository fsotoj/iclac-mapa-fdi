#!/usr/bin/env node
// Ensambla la geometría de bordes de país (B-bis.2). Dos salidas:
//
//   1. data/sources/geo/borders.geojson  — SEMILLA DISPONIBLE: todos los países
//      del registro cuya geometría existe en la fuente Natural Earth
//      (legacy/data/america.geojson). Es lo que el VALIDADOR consulta para el
//      chequeo "sin borde": con esto, la geometría deja de ser un gate para los
//      países de la región (la tenemos nosotros).
//
//   2. public/data/south-america.geojson — MAPA: bordes que el frontend dibuja.
//      Filtrado a los países cuyo archivo de datos PASA la validación (si se pasa
//      un directorio de datos), más los territorios decorativos que el mapa ya
//      mostraba (Guayana Francesa, Malvinas). México NO entra (exclusión).
//
// Uso:
//   node scripts/build_borders.mjs [dirDatos]
//   - sin dirDatos: el mapa incluye todos los países del registro con geometría.
//   - con dirDatos: el mapa incluye solo los que pasan validación (filtro en build).
//
// Idempotente. Fuente Natural Earth: legacy/data/america.geojson (iso_a3/iso_n3/name).
import XLSX from 'xlsx'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRows } from './lib/validate.mjs'
import { loadRegistry } from './lib/load_registry.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const SOURCE = resolve(REPO_ROOT, 'legacy/data/america.geojson')
const CURRENT_MAP = resolve(REPO_ROOT, 'public/data/south-america.geojson')
const SEED_OUT = resolve(REPO_ROOT, 'data/sources/geo/borders.geojson')
const MAP_OUT = CURRENT_MAP

// Territorios decorativos que el mapa ya mostraba (no son países del proyecto).
const DECORATIVE_NAMES = new Set(['French Guiana (France)', 'Falkland Islands (U.K.)'])

const registry = loadRegistry()
if (!registry) {
  console.error('Falta data/schema/countries.csv')
  process.exit(1)
}
if (!existsSync(SOURCE)) {
  console.error(`Falta la fuente Natural Earth: ${SOURCE}`)
  process.exit(1)
}

// Redondea coordenadas a 4 decimales (~11 m) para achicar el archivo sin perder
// forma visible a escala país.
const round4 = (x) => Math.round(x * 1e4) / 1e4
const simplify = (geom) => {
  const map = (c) => (typeof c[0] === 'number' ? [round4(c[0]), round4(c[1])] : c.map(map))
  return { ...geom, coordinates: geom.coordinates.map(map) }
}

const pool = JSON.parse(readFileSync(SOURCE, 'utf8'))
// Índice iso_a3 -> feature de la fuente.
const byA3 = new Map()
for (const f of pool.features ?? []) {
  const a3 = String(f.properties?.iso_a3 || '').toUpperCase()
  if (a3.length === 3 && a3 !== '-99') byA3.set(a3, f)
}

const makeFeature = (alpha3, name) => {
  const src = byA3.get(alpha3)
  if (!src) return null
  return {
    type: 'Feature',
    properties: { name, iso_a3: alpha3 },
    geometry: simplify(src.geometry)
  }
}

// ---- Semilla disponible: todos los países del registro con geometría ----
const seedFeatures = []
const missing = []
for (const c of registry.list) {
  const f = makeFeature(c.alpha3, c.name)
  if (f) seedFeatures.push(f)
  else missing.push(c.name)
}
mkdirSync(dirname(SEED_OUT), { recursive: true })
writeFileSync(SEED_OUT, JSON.stringify({ type: 'FeatureCollection', features: seedFeatures }))
console.log(`Semilla: ${seedFeatures.length} bordes → ${SEED_OUT}`)
if (missing.length) console.log(`  (sin geometría en la fuente, quedan "sin borde": ${missing.join(', ')})`)

// ---- Set de países que pasan (si se pasó un directorio de datos) ----
const dataDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null
let passingA3 = null
if (dataDir && existsSync(dataDir) && statSync(dataDir).isDirectory()) {
  passingA3 = new Set()
  const seedA3 = new Set(seedFeatures.map((f) => f.properties.iso_a3))
  const countryBorders = seedA3
  for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'))) {
    const wb = XLSX.readFile(resolve(dataDir, file))
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
    const { stats } = validateRows(rows, { filename: basename(file), registry, countryBorders, sheetCount: wb.SheetNames.length })
    if (!stats.passed) continue
    // alpha3 del archivo por su nombre canónico
    const stem = basename(file, '.xlsx').toUpperCase()
    const a3 = Object.keys(registry.filenameByAlpha3).find((k) => registry.filenameByAlpha3[k] === stem)
    if (a3) passingA3.add(a3)
  }
  console.log(`Filtro build: ${passingA3.size} países pasan validación`)
}

// ---- Mapa: bordes a dibujar ----
// Preserva la RESOLUCIÓN existente: para un país ya presente en el mapa actual,
// reusa su geometría (más fina que la 110m de Natural Earth). NE solo aporta la
// geometría de países NUEVOS. Así no hay regresión visual en los 13 actuales.
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const nameToA3 = new Map()
for (const [name, info] of Object.entries(registry.countryIso)) nameToA3.set(fold(name), info.alpha3)

const includeA3 = passingA3 ?? new Set(seedFeatures.map((f) => f.properties.iso_a3))
const currentByA3 = new Map() // alpha3 -> feature del mapa actual (alta resolución)
const decorative = []
if (existsSync(CURRENT_MAP)) {
  const cur = JSON.parse(readFileSync(CURRENT_MAP, 'utf8'))
  for (const f of cur.features ?? []) {
    const nm = f.properties?.name
    if (DECORATIVE_NAMES.has(nm)) { decorative.push(f); continue }
    const a3 = String(f.properties?.iso_a3 || '').toUpperCase() || nameToA3.get(fold(nm)) || null
    if (a3) currentByA3.set(a3, f)
  }
}

const mapFeatures = []
for (const a3 of includeA3) {
  if (currentByA3.has(a3)) mapFeatures.push(currentByA3.get(a3)) // preserva alta resolución
  else {
    const nue = seedFeatures.find((f) => f.properties.iso_a3 === a3)
    if (nue) mapFeatures.push(nue) // país nuevo: geometría Natural Earth
  }
}
for (const d of decorative) mapFeatures.push(d)

writeFileSync(MAP_OUT, JSON.stringify({ type: 'FeatureCollection', features: mapFeatures }))
console.log(`Mapa: ${mapFeatures.length} features (${includeA3.size} países + ${decorative.length} decorativos) → ${MAP_OUT}`)
console.log(`  países en el mapa: ${[...includeA3].sort().join(', ')}`)
