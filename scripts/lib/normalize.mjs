// Capa de normalización compartida (sin I/O) — un solo lugar, dos consumidores:
// el validador (scripts/lib/validate.mjs) y el ETL (scripts/etl.mjs), para que
// nunca diverjan. Cada función es determinista y SIN PÉRDIDA: sólo arregla la
// REPRESENTACIÓN del dato (cómo está escrito), nunca su significado.
//
// Regla de oro: normalizar sólo cuando el mapeo es unívoco. Lo que requiere
// juicio (Area_EN="Construction", Project_Type en inglés, ISO que no cuadra con
// el país) NO se toca acá — sigue siendo error en el validador.
//
// Cada función devuelve { value, changed } para poder LISTAR la curación en el
// reporte (convención "documentar, no enmascarar"): el cliente ve qué le
// arreglamos de su lado, no se silencia.

import { COUNTRY_ISO } from './validate.mjs'

// Quita diacríticos y baja a minúscula para comparar sin importar tildes/caso.
const fold = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

// Nombre canónico de país por alpha-3 (inglés, sin tilde). Es la forma que el
// esquema espera en la columna Country.
const CANONICAL_COUNTRY_BY_ALPHA3 = {
  ARG: 'Argentina', BOL: 'Bolivia', BRA: 'Brazil', CHL: 'Chile', COL: 'Colombia',
  ECU: 'Ecuador', GUY: 'Guyana', MEX: 'Mexico', PAN: 'Panama', PRY: 'Paraguay',
  PER: 'Peru', SUR: 'Suriname', URY: 'Uruguay', VEN: 'Venezuela'
}

// Construye el índice folded(nombre) -> nombre canónico desde un mapa
// countryIso + su canónico por alpha-3. Exportado para que el validador/ETL
// armen el índice desde el registro `countries.csv` (país como dato).
export const buildCountryCanonIndex = (countryIso, canonicalByAlpha3) => {
  const idx = new Map()
  for (const [name, info] of Object.entries(countryIso)) {
    const canon = canonicalByAlpha3[info.alpha3]
    if (canon) idx.set(fold(name), canon)
  }
  return idx
}

// Índice por defecto (fallback sin registro): desde COUNTRY_ISO hardcodeado.
// Lazy para evitar el problema de inicialización del import circular con
// validate.mjs (COUNTRY_ISO aún no existe cuando este módulo se evalúa).
let _defaultIndex = null
const defaultIndex = () => {
  if (!_defaultIndex) _defaultIndex = buildCountryCanonIndex(COUNTRY_ISO, CANONICAL_COUNTRY_BY_ALPHA3)
  return _defaultIndex
}

/**
 * Quita un apóstrofe inicial pegado por Excel para "forzar texto" (`'152` → `152`).
 * Sin pérdida: el apóstrofe no es parte del dato. Cubre COUNTRY_ISO_NUM e Id_Seq.
 * @returns {{value: string|null, changed: boolean}}
 */
export const stripLeadingApostrophe = (raw) => {
  if (raw === null || raw === undefined) return { value: raw, changed: false }
  const s = String(raw)
  if (s.startsWith("'")) return { value: s.slice(1), changed: true }
  return { value: s, changed: false }
}

/**
 * Lleva Country a su forma canónica cuando la variante es reconocible sin
 * ambigüedad (mayúsculas, tildes, Brasil/Brazil). Si no se reconoce, deja el
 * valor tal cual (país nuevo / fuera de lista → lo maneja el validador).
 * @returns {{value: string|null, changed: boolean, matched: boolean}}
 */
export const canonCountry = (raw, index) => {
  if (raw === null || raw === undefined) return { value: raw, changed: false, matched: false }
  const s = String(raw).trim()
  if (s === '') return { value: s, changed: false, matched: false }
  const canon = (index ?? defaultIndex()).get(fold(s))
  if (!canon) return { value: s, changed: false, matched: false }
  return { value: canon, changed: canon !== s, matched: true }
}

/**
 * Match case-insensitive del nombre de archivo contra la lista canónica de
 * países. Acepta `chile.xlsx` y `CHILE.xlsx` por igual (evita la clase de error
 * que sólo aparece en Linux/CI y corta el ida-y-vuelta de renombres).
 * @param {string} filename nombre base con extensión
 * @param {Set<string>} canonicalNames set de nombres canónicos (sin .xlsx), en MAYÚSCULA
 * @returns {{canonical: string|null, matched: boolean, changed: boolean}}
 */
export const matchFilenameCountry = (filename, canonicalNames) => {
  if (!filename || !filename.toLowerCase().endsWith('.xlsx')) {
    return { canonical: null, matched: false, changed: false }
  }
  const stem = filename.slice(0, -'.xlsx'.length)
  const up = stem.toUpperCase()
  if (canonicalNames.has(up)) {
    return { canonical: `${up}.xlsx`, matched: true, changed: `${up}.xlsx` !== filename }
  }
  return { canonical: null, matched: false, changed: false }
}
