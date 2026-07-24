// Carga con I/O del registro de países y del set de bordes disponibles.
// Vive fuera del núcleo puro (validate.mjs): los scripts CLI (validate_data,
// build_validation_report, etl) lo usan para pasar `registry` + `countryBorders`
// a validateRows.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCountriesCsv } from './countries.mjs'
import { buildCountryCanonIndex } from './normalize.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

const DEFAULT_CSV = resolve(REPO_ROOT, 'data/schema/countries.csv')
// Semilla de bordes DISPONIBLES (todos los países del registro con geometría,
// generada por build_borders.mjs). Es la base del chequeo "sin borde": refleja
// qué países PODEMOS dibujar, no cuáles están hoy en el mapa filtrado. Fallback
// al geojson del mapa si la semilla aún no se generó.
const SEED_GEO = resolve(REPO_ROOT, 'data/sources/geo/borders.geojson')
const MAP_GEO = resolve(REPO_ROOT, 'public/data/south-america.geojson')
const DEFAULT_GEO = existsSync(SEED_GEO) ? SEED_GEO : MAP_GEO

const fold = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/**
 * Carga countries.csv y devuelve el registro listo para validateRows
 * (incluye canonIndex prearmado). null si el archivo no existe.
 */
export const loadRegistry = (csvPath = DEFAULT_CSV) => {
  if (!existsSync(csvPath)) return null
  const parsed = parseCountriesCsv(readFileSync(csvPath, 'utf8'))
  return { ...parsed, canonIndex: buildCountryCanonIndex(parsed.countryIso, parsed.canonicalByAlpha3) }
}

/**
 * Set de alpha-3 que tienen borde de país en el geojson del mapa. Matchea por
 * iso_a3 en props o, si falta, por nombre contra el registro. null si no hay geojson.
 */
export const loadCountryBorders = (registry, geoPath = DEFAULT_GEO) => {
  if (!existsSync(geoPath)) return null
  let gj
  try {
    gj = JSON.parse(readFileSync(geoPath, 'utf8'))
  } catch {
    return null
  }
  const nameToA3 = new Map()
  for (const [name, info] of Object.entries(registry?.countryIso ?? {})) nameToA3.set(fold(name), info.alpha3)
  const borders = new Set()
  for (const f of gj.features ?? []) {
    const p = f.properties ?? {}
    const a3 = String(p.iso_a3 || p.ISO_A3 || p.ISO_A3_EH || '').toUpperCase()
    if (a3.length === 3 && a3 !== '-99') {
      borders.add(a3)
      continue
    }
    const nm = p.name || p.NAME || p.admin || p.ADMIN
    if (nm) {
      const m = nameToA3.get(fold(nm))
      if (m) borders.add(m)
    }
  }
  return borders
}
