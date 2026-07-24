// Núcleo puro del validador de datos (sin I/O) — spec: data/schema/schema.md §7
// "Resumen legible por máquina" (v1.2). Consumido por scripts/validate_data.mjs
// (CLI + GH Actions) y por scripts/validate.test.mjs.
//
// Contrato: validateRows(rows, opts) recibe las filas ya parseadas del XLSX
// (sheet_to_json con defval:null) y devuelve issues tipados; nunca lanza por
// datos malos. Mensajes en español, legibles para no-programadores: siempre
// valor recibido + valor esperado.

import { stripLeadingApostrophe, canonCountry, matchFilenameCountry } from './normalize.mjs'

// ---- Enums y constantes del esquema ----

// 8 sectores canónicos (data/schema/sectores.md v1.2). EN es la clave exacta
// (el frontend traduce keyed por Area_EN); ES es la traducción pareada 1:1.
export const SECTOR_PAIRS = {
  Energy: 'Energía',
  Manufacturing: 'Manufactura',
  'Real Estate': 'Bienes Raíces',
  Mining: 'Minería',
  ICT: 'TIC',
  Agroindustry: 'Agronegocios',
  Finance: 'Finanzas',
  Infrastructure: 'Infraestructura'
}

export const PROJECT_TYPES = ['Adquisición', 'Greenfield', 'Construcción']
// Typos ya vistos en entregas reales (etl.mjs los canoniza; aquí solo se sugieren).
const PROJECT_TYPE_HINTS = { Adquisión: 'Adquisición', Adquisicón: 'Adquisición', Acquisition: 'Adquisición' }

const YES_NO = ['Yes', 'No']

// Ownership (v1.4): enum de Yifang Wang/Dialogue. La base la manda el cliente.
export const OWNERSHIP_TYPES = ['Central SOE', 'Local SOE', 'POE', 'MIXED', 'UNKNOWN']
// Formas viejas a migrar (Flo usó SOE donde iba Local SOE; SASAC → Central SOE).
const OWNERSHIP_HINTS = { SOE: 'Local SOE', SASAC: 'Central SOE' }

// Países del alcance actual + ISO (mismo universo que COUNTRY_TO_ISO3 de
// build_fdi_share.mjs, más variantes de nombre vistas en las bases).
export const COUNTRY_ISO = {
  Argentina: { alpha3: 'ARG', num: '032' },
  Bolivia: { alpha3: 'BOL', num: '068' },
  Brazil: { alpha3: 'BRA', num: '076' },
  Brasil: { alpha3: 'BRA', num: '076' },
  Chile: { alpha3: 'CHL', num: '152' },
  Colombia: { alpha3: 'COL', num: '170' },
  Ecuador: { alpha3: 'ECU', num: '218' },
  Guyana: { alpha3: 'GUY', num: '328' },
  Mexico: { alpha3: 'MEX', num: '484' },
  México: { alpha3: 'MEX', num: '484' },
  Panama: { alpha3: 'PAN', num: '591' },
  Panamá: { alpha3: 'PAN', num: '591' },
  Paraguay: { alpha3: 'PRY', num: '600' },
  Peru: { alpha3: 'PER', num: '604' },
  Perú: { alpha3: 'PER', num: '604' },
  Suriname: { alpha3: 'SUR', num: '740' },
  Surinam: { alpha3: 'SUR', num: '740' },
  Uruguay: { alpha3: 'URY', num: '858' },
  Venezuela: { alpha3: 'VEN', num: '862' }
}

export const ID_FORMAT = /^[A-Z]{3}-\d{4}$/

// Nombre de archivo por país: país en MAYÚSCULA, inglés, sin tildes (schema §1).
// Convención adoptada de la primera carga del cliente al repo (09-07-2026);
// reemplaza la "minúscula/español" de v1.2.
const FILENAME_BY_ALPHA3 = {
  ARG: 'ARGENTINA', BOL: 'BOLIVIA', BRA: 'BRAZIL', CHL: 'CHILE', COL: 'COLOMBIA',
  ECU: 'ECUADOR', GUY: 'GUYANA', MEX: 'MEXICO', PAN: 'PANAMA', PRY: 'PARAGUAY',
  PER: 'PERU', SUR: 'SURINAME', URY: 'URUGUAY', VEN: 'VENEZUELA'
}
const CANONICAL_FILENAMES = new Set(Object.values(FILENAME_BY_ALPHA3))

// Columnas requeridas por el esquema v1.2. Id_Seq y News son parte del contrato
// nuevo; en bases legadas su ausencia se reporta como warning (ver missingSoft).
const REQUIRED_COLUMNS = [
  'Id_Investment', 'Coordinates', 'Year', 'Country', 'COUNTRY_ISO_NUM',
  'COUNTRY_ISO_ALPHA3', 'Investor', 'Vector', 'Path', 'Area_EN', 'Area_ES',
  'Project_Type', 'Research'
]
// Requeridas del contrato v1.2 aún "en adopción" (Id_Seq propuesta, News nueva):
// ausentes = warning de archivo, presentes = se validan como req.
const REQUIRED_SOFT_COLUMNS = ['Id_Seq', 'News']

const KNOWN_OPTIONAL = new Set([
  'Province_ISO', 'Detail_ES', 'Detail_EN', 'Investment', 'Location',
  'Joint_Venture', 'Origin_Of_Seller', 'Stake',
  ...Array.from({ length: 14 }, (_, i) => `Caso${i + 1}`),
  ...Array.from({ length: 14 }, (_, i) => `Link${i + 1}`)
])

// Prohibidas (schema §3/§7): mismas señales que el esquema pide eliminar.
const isProhibited = (col) =>
  ['Acquisition', 'Greenfield', 'Construction', 'Project_Type_ES', 'Project_Type_EN'].includes(col) ||
  /_ORIG$/i.test(col) || /_ARREGLADO$/i.test(col) || /^__EMPTY/.test(col)

// ---- Helpers (portados de etl.mjs / audit_base.mjs) ----

const cleanStr = (v) => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export const parseCoordinates = (raw) => {
  const s = cleanStr(raw)
  if (!s) return null
  const parts = s.split(',')
  if (parts.length !== 2) return null
  const lat = Number.parseFloat(parts[0])
  const lng = Number.parseFloat(parts[1])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

// Coordenada normalizada a 6 decimales — detector de geometría duplicada.
const coordKey = (coords) => coords.map((n) => n.toFixed(6)).join(',')

const looksLikeUrl = (s) => /https?:\/\//i.test(s)

// Nombre de archivo canónico: país del proyecto, en inglés, sin tildes.
// Case-insensitive (v1.4): acepta CHILE.xlsx y chile.xlsx por igual — la
// diferencia de mayúsculas la absorbe la normalización, no es un error.
export const isCanonicalFilename = (name) =>
  matchFilenameCountry(name, CANONICAL_FILENAMES).matched

// Concepto EN al que apunta un valor de Area_ES (para detectar conflicto EN↔ES,
// no formato). Canónicos + variantes no canónicas conceptualmente claras.
const ES_CONCEPT = {}
for (const [en, es] of Object.entries(SECTOR_PAIRS)) ES_CONCEPT[es.toLowerCase()] = en
Object.assign(ES_CONCEPT, {
  agroindustria: 'Agroindustry',
  tic: 'ICT',
  manufacturas: 'Manufacturing',
  manufactura: 'Manufacturing'
})
const conceptOfAreaEs = (es) => {
  const k = String(es ?? '').trim().toLowerCase()
  if (!k) return null
  if (ES_CONCEPT[k]) return ES_CONCEPT[k]
  for (const [esk, en] of Object.entries(ES_CONCEPT)) if (k.startsWith(esk)) return en
  return null
}

// ---- Núcleo ----

/**
 * @param {Array<Record<string, unknown>>} rows filas del XLSX (defval: null)
 * @param {object} opts
 * @param {string} [opts.filename] nombre base del archivo (para reglas de archivo)
 * @param {boolean} [opts.strictIds=false] formato ALPHA3-NNNN como error (tras confirmación cliente)
 * @param {number} [opts.threshold=95] % mínimo de filas válidas
 * @param {number} [opts.sheetCount=1] nº de hojas del workbook
 * @param {object} [opts.registry] registro de países (countries.csv). Si se omite, usa el hardcodeado.
 * @param {Set<string>} [opts.countryBorders] alpha-3 con borde de país disponible (para el chequeo de geometría). null = no chequear.
 */
export const validateRows = (rows, opts = {}) => {
  const { filename = null, strictIds = false, threshold = 95, sheetCount = 1, registry = null, countryBorders = null } = opts
  // Registro de países: del CSV si se pasa, o el hardcodeado como fallback (tests/legacy).
  const ISO = registry?.countryIso ?? COUNTRY_ISO
  const FN_BY_A3 = registry?.filenameByAlpha3 ?? FILENAME_BY_ALPHA3
  const CANON_FN = registry?.canonicalFilenames ?? CANONICAL_FILENAMES
  const canonIndex = registry?.canonIndex // undefined → canonCountry usa su índice por defecto
  const fileErrors = []
  const issues = []
  const curaciones = [] // { rule, kind, column, count } — arreglos deterministas de nuestro lado
  const push = (severity, rule, row, column, value, message) =>
    issues.push({ severity, rule, row, column, value, message })

  // ---- Reglas de archivo ----
  const fnMatch = filename ? matchFilenameCountry(filename, CANON_FN) : { matched: false, changed: false, canonical: null }
  if (filename && !fnMatch.matched) {
    fileErrors.push({
      rule: 'archivo/nombre',
      message: `El nombre "${filename}" no corresponde a un país del proyecto (en inglés, sin tildes; ej: CHILE.xlsx, BRAZIL.xlsx). Las mayúsculas/minúsculas no importan.`
    })
  } else if (filename && fnMatch.changed) {
    curaciones.push({ rule: 'curacion/nombre-archivo', kind: 'caso', column: null, count: 1,
      message: `Nombre de archivo normalizado a "${fnMatch.canonical}" (las mayúsculas/minúsculas no importan).` })
  }
  if (sheetCount > 1) {
    fileErrors.push({
      rule: 'archivo/hojas',
      message: `El archivo tiene ${sheetCount} hojas; debe tener una sola hoja de datos.`
    })
  }
  // Geometría de país (compuerta blanda): si el país no tiene borde disponible,
  // sus inversiones no se dibujan en el mapa hasta que se agregue. Avisa, no bota.
  // countryBorders=null → no se chequea (no se pasó la lista de bordes).
  if (fnMatch.matched && countryBorders) {
    const stem = fnMatch.canonical.slice(0, -'.xlsx'.length)
    const alpha3 = Object.keys(FN_BY_A3).find((a3) => FN_BY_A3[a3] === stem)
    if (alpha3 && !countryBorders.has(alpha3)) {
      push('warning', 'archivo/sin-borde', 0, null, null,
        'Este país todavía no tiene borde de país cargado: sus inversiones no se dibujarán en el mapa hasta agregar la geometría. No bota el archivo.')
    }
  }

  const columns = rows.length ? Object.keys(rows[0]) : []
  const prohibited = columns.filter(isProhibited)
  for (const col of prohibited) {
    fileErrors.push({
      rule: 'archivo/columna-prohibida',
      message: `La columna "${col}" no debe existir en el archivo (${/_ORIG$|_ARREGLADO$/i.test(col) ? 'columna de trabajo: dejar una sola columna canónica por campo' : /^__EMPTY/.test(col) ? 'columna fantasma de Excel: eliminar' : 'redundante con Project_Type: la información va solo en Project_Type'}).`
    })
  }
  const missingHard = REQUIRED_COLUMNS.filter((c) => !columns.includes(c))
  for (const col of missingHard) {
    fileErrors.push({
      rule: 'archivo/columna-requerida',
      message: `Falta la columna obligatoria "${col}".`
    })
  }
  const missingSoft = REQUIRED_SOFT_COLUMNS.filter((c) => !columns.includes(c))
  for (const col of missingSoft) {
    push('warning', 'archivo/columna-nueva-ausente', 0, col, null,
      `Falta la columna "${col}" del esquema v1.2 (${col === 'Id_Seq' ? 'secuencia por país, base del Id_Investment nuevo' : 'marca Yes/No de fuentes que son noticia'}). Se validará como obligatoria cuando se adopte.`)
  }
  const unknown = columns.filter((c) =>
    !REQUIRED_COLUMNS.includes(c) && !REQUIRED_SOFT_COLUMNS.includes(c) && !KNOWN_OPTIONAL.has(c) && !isProhibited(c)
  )
  // Renombres pendientes conocidos: la columna vieja se acepta pero se pide migrar.
  const RENAMES = { 'Origin of seller': 'Origin_Of_Seller' }
  for (const col of unknown) {
    if (RENAMES[col]) {
      push('warning', 'archivo/columna-renombrada', 0, col, null,
        `La columna "${col}" fue renombrada en el esquema: usar "${RENAMES[col]}".`)
    } else {
      push('info', 'archivo/columna-extra', 0, col, null,
        `Columna extra "${col}": permitida, el sistema la ignora.`)
    }
  }

  // Si faltan columnas duras, la validación por fila igual corre con lo que haya
  // (más señal para el reporte), pero el archivo ya está reprobado.

  const hasCol = (c) => columns.includes(c)
  const currentYear = new Date().getFullYear()

  // ---- Normalización de valores (determinista, sin pérdida) ----
  // Se arregla la representación ANTES de validar, así el reporte no se llena de
  // miles de errores cosméticos. Cada arreglo se lista en `curaciones`.
  const normCount = { isoNum: 0, idSeq: 0, country: 0 }
  const normRows = rows.map((row) => {
    const out = { ...row }
    if (hasCol('COUNTRY_ISO_NUM')) {
      const r = stripLeadingApostrophe(out.COUNTRY_ISO_NUM)
      if (r.changed) { out.COUNTRY_ISO_NUM = r.value; normCount.isoNum++ }
    }
    if (hasCol('Id_Seq')) {
      const r = stripLeadingApostrophe(out.Id_Seq)
      if (r.changed) { out.Id_Seq = r.value; normCount.idSeq++ }
    }
    if (hasCol('Country')) {
      const r = canonCountry(out.Country, canonIndex)
      if (r.changed) { out.Country = r.value; normCount.country++ }
    }
    return out
  })
  if (normCount.isoNum) curaciones.push({ rule: 'curacion/iso-apostrofe', column: 'COUNTRY_ISO_NUM', count: normCount.isoNum,
    message: `Se quitó el apóstrofe inicial de COUNTRY_ISO_NUM ('152 → 152) en ${normCount.isoNum} fila(s).` })
  if (normCount.idSeq) curaciones.push({ rule: 'curacion/idseq-apostrofe', column: 'Id_Seq', count: normCount.idSeq,
    message: `Se quitó el apóstrofe inicial de Id_Seq en ${normCount.idSeq} fila(s).` })
  if (normCount.country) curaciones.push({ rule: 'curacion/pais-canonico', column: 'Country', count: normCount.country,
    message: `Se normalizó Country a su forma canónica (ej: CHILE → Chile) en ${normCount.country} fila(s).` })

  // Estado inter-fila
  const rowValid = new Array(rows.length).fill(true)
  const idMeta = new Map() // id -> { country, investor, year, amount, row }
  const lineMeta = new Map() // `${id}|${path}` (Vector) -> { detail, amount, area, row }
  const coordToIds = new Map() // coordKey -> Map(id -> primera fila)
  const filenameCountry = fnMatch.matched ? fnMatch.canonical.slice(0, -'.xlsx'.length) : null

  const fail = (i, rule, column, value, message) => {
    rowValid[i] = false
    push('error', rule, i + 2, column, value, message)
  }

  normRows.forEach((row, i) => {
    const excelRow = i + 2

    // Fila totalmente vacía: warning, no cuenta al umbral (se salta).
    const allNull = columns.every((c) => cleanStr(row[c]) === null)
    if (allNull) {
      push('warning', 'fila/vacia', excelRow, null, null, 'Fila en blanco intercalada: eliminar.')
      return
    }

    // -- requeridos presentes --
    for (const col of REQUIRED_COLUMNS) {
      if (hasCol(col) && cleanStr(row[col]) === null) {
        fail(i, 'fila/requerido-vacio', col, null, `La columna obligatoria "${col}" está vacía.`)
      }
    }
    for (const col of REQUIRED_SOFT_COLUMNS) {
      if (hasCol(col) && cleanStr(row[col]) === null) {
        push('warning', 'fila/requerido-nuevo-vacio', excelRow, col, null, `"${col}" vacío (obligatorio en el esquema v1.2).`)
      }
    }

    // -- Year --
    const yearRaw = cleanStr(row.Year)
    if (yearRaw !== null) {
      const year = Number(yearRaw)
      if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
        fail(i, 'fila/year', 'Year', yearRaw, `Año "${yearRaw}" inválido: debe ser un entero entre 1900 y ${currentYear}.`)
      }
    }

    // -- Coordinates --
    const coordRaw = cleanStr(row.Coordinates)
    let coords = null
    if (coordRaw !== null) {
      coords = parseCoordinates(coordRaw)
      if (!coords) {
        fail(i, 'fila/coordenadas', 'Coordinates', coordRaw,
          `Coordenadas "${coordRaw}" inválidas: formato esperado "lat, lng" con lat entre -90 y 90 y lng entre -180 y 180 (decimal con punto).`)
      } else if (coords[0] >= 15 || coords[1] >= -30) {
        push('warning', 'fila/coordenadas-sospechosas', excelRow, 'Coordinates', coordRaw,
          `Coordenadas fuera del rango esperado para LATAM continental (lat < 15, lng < -30): revisar si lat y lng están invertidas.`)
      }
    }

    // -- Vector / Path --
    const vector = cleanStr(row.Vector)
    if (vector !== null && vector !== 'Punto' && vector !== 'Vector') {
      fail(i, 'fila/vector', 'Vector', vector, `Vector "${vector}" inválido: debe ser "Punto" o "Vector".`)
    }
    const pathRaw = cleanStr(row.Path)
    if (pathRaw !== null && (vector === 'Punto' || vector === 'Vector')) {
      const path = Number(pathRaw)
      if (!Number.isInteger(path)) {
        fail(i, 'fila/path', 'Path', pathRaw, `Path "${pathRaw}" inválido: debe ser un entero.`)
      } else if (vector === 'Punto' && path !== 0) {
        fail(i, 'fila/path', 'Path', pathRaw, `Path debe ser 0 cuando Vector es "Punto" (recibido: ${pathRaw}).`)
      } else if (vector === 'Vector' && path < 1) {
        fail(i, 'fila/path', 'Path', pathRaw, `Path debe ser 1 o mayor cuando Vector es "Vector" (recibido: ${pathRaw}).`)
      }
    }

    // -- Area_EN / Area_ES --
    const areaEn = row.Area_EN === null || row.Area_EN === undefined ? null : String(row.Area_EN)
    if (areaEn !== null && !(areaEn in SECTOR_PAIRS)) {
      let hint = ''
      const trimmed = areaEn.trim()
      const title = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
      const esKey = Object.entries(SECTOR_PAIRS).find(([, es]) => es.localeCompare(trimmed, 'es', { sensitivity: 'base' }) === 0)
      if (trimmed !== areaEn && trimmed in SECTOR_PAIRS) hint = ` (tiene espacios de más: usar "${trimmed}")`
      else if (title in SECTOR_PAIRS) hint = ` (problema de mayúsculas: usar "${title}")`
      else if (trimmed === 'RealEstate') hint = ' (usar "Real Estate", con espacio)'
      else if (esKey) hint = ` (es el valor en español: en Area_EN va "${esKey[0]}")`
      else if (trimmed === 'Services') hint = ' ("Services" fue rechazado por la metodología: reclasificar en uno de los 8 sectores)'
      fail(i, 'fila/sector-en', 'Area_EN', areaEn,
        `Sector "${areaEn}" no es uno de los 8 canónicos en inglés (${Object.keys(SECTOR_PAIRS).join(', ')})${hint}. Un valor no exacto pinta la inversión gris y duplica la categoría en el filtro, en los 3 idiomas.`)
    }
    // Area_ES ya NO se valida por formato (el mapa traduce keyed por Area_EN, así
    // que la etiqueta ES es redundante — v1.4). Se conserva SÓLO el conflicto
    // conceptual: cuando Area_ES apunta a un sector DISTINTO del de Area_EN, una
    // de las dos está mal (ver next_steps §0.b C9). Warning, no bloquea.
    const areaEs = cleanStr(row.Area_ES)
    if (areaEn !== null && areaEs !== null) {
      const concept = conceptOfAreaEs(areaEs)
      if (concept && concept !== areaEn) {
        push('warning', 'fila/sector-conflicto', excelRow, 'Area_ES', areaEs,
          `Conflicto de sector: Area_EN dice "${areaEn}" pero Area_ES "${areaEs}" corresponde a "${concept}". Una de las dos está mal; revisar cuál es el sector real.`)
      }
    }

    // -- Ownership (v1.4, en adopción: warning, no bota) --
    // La base la manda el cliente. Enum de Yifang. `SASAC`/`SOE` son las formas
    // viejas que hay que migrar a Central SOE / Local SOE (Flo no adoptó Local SOE).
    const ownership = cleanStr(row.Ownership)
    if (ownership !== null && !OWNERSHIP_TYPES.includes(ownership)) {
      const hint = OWNERSHIP_HINTS[ownership] ? ` (¿quiso decir "${OWNERSHIP_HINTS[ownership]}"?)` : ''
      push('warning', 'fila/ownership', excelRow, 'Ownership', ownership,
        `Ownership "${ownership}" no está en el enum (${OWNERSHIP_TYPES.join(', ')})${hint}.`)
    }

    // -- Project_Type --
    const pt = cleanStr(row.Project_Type)
    if (pt !== null && !PROJECT_TYPES.includes(pt)) {
      const hint = PROJECT_TYPE_HINTS[pt] ? ` (¿quiso decir "${PROJECT_TYPE_HINTS[pt]}"?)` : ''
      fail(i, 'fila/project-type', 'Project_Type', pt,
        `Project_Type "${pt}" inválido: debe ser exactamente Adquisición, Greenfield o Construcción${hint}.`)
    }

    // -- Research / News / Joint_Venture --
    for (const col of ['Research', 'News', 'Joint_Venture']) {
      const v = cleanStr(row[col])
      if (v !== null && !YES_NO.includes(v)) {
        const msg = `"${col}" debe ser "Yes" o "No" (recibido: "${v}").`
        if (col === 'Joint_Venture' || (col === 'News' && missingSoft.includes('News'))) push('warning', `fila/${col.toLowerCase()}`, excelRow, col, v, msg)
        else fail(i, `fila/${col.toLowerCase()}`, col, v, msg)
      }
    }

    // -- ISO --
    const isoNumRaw = row.COUNTRY_ISO_NUM === null || row.COUNTRY_ISO_NUM === undefined ? null : String(row.COUNTRY_ISO_NUM).trim()
    const country = cleanStr(row.Country)
    const isoInfo = country ? ISO[country] : undefined
    if (isoNumRaw !== null && !/^\d{3}$/.test(isoNumRaw)) {
      fail(i, 'fila/iso-num', 'COUNTRY_ISO_NUM', isoNumRaw,
        `COUNTRY_ISO_NUM "${isoNumRaw}" inválido: deben ser 3 dígitos con ceros a la izquierda (ej: "152" Chile, "032" Argentina). Guardar la celda como texto.`)
    } else if (isoNumRaw !== null && isoInfo && isoNumRaw !== isoInfo.num) {
      fail(i, 'fila/iso-num', 'COUNTRY_ISO_NUM', isoNumRaw,
        `COUNTRY_ISO_NUM "${isoNumRaw}" no corresponde a ${country} (esperado: "${isoInfo.num}").`)
    }
    const alpha3 = cleanStr(row.COUNTRY_ISO_ALPHA3)
    if (alpha3 !== null && isoInfo && alpha3 !== isoInfo.alpha3) {
      fail(i, 'fila/iso-alpha3', 'COUNTRY_ISO_ALPHA3', alpha3,
        `COUNTRY_ISO_ALPHA3 "${alpha3}" no corresponde a ${country} (esperado: "${isoInfo.alpha3}").`)
    }
    if (country !== null && !isoInfo) {
      push('warning', 'fila/pais-desconocido', excelRow, 'Country', country,
        `País "${country}" no está en la lista de países del proyecto: verificar nombre (o avisar para ampliar la lista).`)
    }
    // Consistencia archivo↔país: solo en el flujo por país (nombre canónico =
    // país en MAYÚSCULA/inglés). Archivos agregados (nombre no canónico) la saltan.
    if (filenameCountry && country && isoInfo && filename && fnMatch.matched) {
      const expected = FN_BY_A3[isoInfo.alpha3]
      if (filenameCountry !== expected) {
        fail(i, 'fila/pais-archivo', 'Country', country,
          `La fila es de ${country} pero el archivo es "${filename}": cada archivo lleva un solo país (esperado: "${expected}.xlsx").`)
      }
    }

    // -- Investment / Stake --
    const inv = cleanStr(row.Investment)
    if (inv !== null) {
      const n = Number(inv)
      if (!Number.isFinite(n)) {
        fail(i, 'fila/monto', 'Investment', inv, `Investment "${inv}" no es un número (decimal con punto, en millones de USD).`)
      } else if (n < 0) {
        fail(i, 'fila/monto', 'Investment', inv, `Investment no puede ser negativo (recibido: ${inv}).`)
      }
    }
    const stake = cleanStr(row.Stake)
    if (stake !== null) {
      const n = Number(stake)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        fail(i, 'fila/stake', 'Stake', stake, `Stake "${stake}" inválido: porcentaje entre 0 y 100.`)
      }
    }

    // -- Location sin URL --
    const location = cleanStr(row.Location)
    if (location !== null && looksLikeUrl(location)) {
      push('warning', 'fila/location-url', excelRow, 'Location', location.slice(0, 60),
        'Location contiene una URL: debe ser texto plano (dirección/lugar); los enlaces van en LinkN.')
    }

    // -- CasoN / LinkN --
    let hasCitation = false
    for (let n = 1; n <= 14; n++) {
      const caso = cleanStr(row[`Caso${n}`])
      const link = cleanStr(row[`Link${n}`])
      if (caso || link) hasCitation = true
      if (caso && looksLikeUrl(caso)) {
        push('warning', 'fila/caso-url', excelRow, `Caso${n}`, caso.slice(0, 60),
          `Caso${n} contiene una URL: el título va en Caso${n} y la URL en Link${n}.`)
      }
    }
    const research = cleanStr(row.Research)
    const news = cleanStr(row.News)
    if (hasCitation && research !== 'Yes' && news !== 'Yes') {
      push('warning', 'fila/cita-invisible', excelRow, 'Research', research,
        'La fila tiene fuentes (CasoN/LinkN) pero ni Research ni News están en "Yes": esas fuentes quedan invisibles en la plataforma.')
    }

    // -- Id: formato + colisiones + coherencia inter-fila --
    const id = cleanStr(row.Id_Investment)
    if (id !== null) {
      const idSevPush = (rule, column, value, message) =>
        strictIds ? fail(i, rule, column, value, message) : push('warning', rule, excelRow, column, value, message)
      if (!ID_FORMAT.test(id)) {
        idSevPush('fila/id-formato', 'Id_Investment', id,
          `Id_Investment "${id}" no sigue el formato propuesto ALPHA3-NNNN (ej: "ARG-0080").`)
      } else {
        const prefix = id.slice(0, 3)
        if (isoInfo && prefix !== isoInfo.alpha3) {
          fail(i, 'fila/id-prefijo', 'Id_Investment', id,
            `El prefijo "${prefix}" del Id_Investment no corresponde al país de la fila (${country} = ${isoInfo.alpha3}).`)
        }
        const seq = cleanStr(row.Id_Seq)
        if (seq !== null) {
          const expected = `${prefix}-${String(Number(seq)).padStart(4, '0')}`
          if (id !== expected) {
            fail(i, 'fila/id-seq', 'Id_Seq', seq,
              `Id_Investment "${id}" no es consistente con Id_Seq ${seq} (esperado: "${expected}").`)
          }
        }
      }

      // colisión: mismo id, país distinto (caso 0019100) — error siempre
      const prev = idMeta.get(id)
      if (prev) {
        if (country && prev.country && country !== prev.country) {
          fail(i, 'fila/id-colision', 'Id_Investment', id,
            `El Id_Investment "${id}" ya se usa en ${prev.country} (fila ${prev.row}): dos inversiones distintas no pueden compartir id.`)
        }
        // metadata consistente entre filas del mismo id (multi-punto repite campos)
        if (inv !== null && prev.amount !== null && Number(inv) !== Number(prev.amount)) {
          push('warning', 'fila/monto-inconsistente', excelRow, 'Investment', inv,
            `Investment distinto entre filas de la misma inversión "${id}" (fila ${prev.row}: ${prev.amount}, esta fila: ${inv}). El monto debe repetirse idéntico; al sumar se cuenta una sola vez.`)
        }
        if (yearRaw !== null && prev.year !== null && yearRaw !== prev.year) {
          push('warning', 'fila/metadata-inconsistente', excelRow, 'Year', yearRaw,
            `Year distinto entre filas de la misma inversión "${id}" (fila ${prev.row}: ${prev.year}, esta fila: ${yearRaw}).`)
        }
      } else {
        idMeta.set(id, { country, investor: cleanStr(row.Investor), year: yearRaw, amount: inv, row: excelRow })
      }

      // geometría compartida entre ids distintos (patrón anuncio/cierre)
      if (coords) {
        const k = coordKey(coords)
        if (!coordToIds.has(k)) coordToIds.set(k, new Map())
        const m = coordToIds.get(k)
        if (!m.has(id)) m.set(id, excelRow)
      }
    }
  })

  // ---- Post-pass: geometría compartida (≥2 coords idénticas entre 2 ids) ----
  const pairShared = new Map() // 'a|b' -> count
  for (const m of coordToIds.values()) {
    if (m.size < 2) continue
    const ids = [...m.keys()].sort()
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const key = `${ids[a]}|${ids[b]}`
        pairShared.set(key, (pairShared.get(key) ?? 0) + 1)
      }
    }
  }
  for (const [key, shared] of pairShared) {
    if (shared < 2) continue
    const [a, b] = key.split('|')
    push('warning', 'archivo/geometria-compartida', idMeta.get(a)?.row ?? 0, 'Coordinates', `${a} + ${b}`,
      `Las inversiones "${a}" y "${b}" comparten ${shared} coordenadas idénticas: revisar si son la misma operación registrada dos veces (ej: anuncio y cierre) o etapas legítimas del mismo proyecto.`)
  }

  // ---- Resultado ----
  const skipped = issues.filter((x) => x.rule === 'fila/vacia').length
  const consideredRows = rows.length - skipped
  const invalidRows = rowValid.filter((v, i) => !v).length
  const validPct = consideredRows === 0 ? 100 : ((consideredRows - invalidRows) / consideredRows) * 100
  const passed = fileErrors.length === 0 && validPct >= threshold

  return {
    fileErrors,
    issues,
    curaciones,
    stats: {
      rows: rows.length,
      consideredRows,
      invalidRows,
      validPct: Math.round(validPct * 100) / 100,
      errors: issues.filter((x) => x.severity === 'error').length + fileErrors.length,
      warnings: issues.filter((x) => x.severity === 'warning').length,
      curaciones: curaciones.reduce((n, c) => n + (c.count ?? 0), 0),
      threshold,
      passed
    }
  }
}
