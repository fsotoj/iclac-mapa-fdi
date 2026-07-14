import { describe, it, expect } from 'vitest'
import { validateRows } from './lib/validate.mjs'

// Fila válida del contrato v1.2 (CHILE.xlsx). Overrides por test.
const makeRow = (over = {}) => ({
  Id_Investment: 'CHL-0001',
  Id_Seq: 1,
  Coordinates: '-33.45, -70.66',
  Year: 2020,
  Country: 'Chile',
  COUNTRY_ISO_NUM: '152',
  COUNTRY_ISO_ALPHA3: 'CHL',
  Province_ISO: null,
  Investor: 'State Grid',
  Vector: 'Punto',
  Path: 0,
  Area_EN: 'Energy',
  Area_ES: 'Energía',
  Detail_ES: 'Compra de activos',
  Detail_EN: 'Asset acquisition',
  Investment: 100,
  Location: 'Santiago',
  Project_Type: 'Adquisición',
  Joint_Venture: 'No',
  Origin_Of_Seller: null,
  Stake: 50,
  Research: 'No',
  News: 'No',
  Caso1: null,
  Link1: null,
  ...over
})

const run = (rows, opts = {}) => validateRows(rows, { filename: 'CHILE.xlsx', ...opts })
const errorsOf = (r) => r.issues.filter((x) => x.severity === 'error')
const warningsOf = (r) => r.issues.filter((x) => x.severity === 'warning')
const rules = (xs) => xs.map((x) => x.rule)

describe('archivo válido', () => {
  it('puntos + línea Vector multi-fila pasan sin errores', () => {
    const rows = [
      makeRow(),
      makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Coordinates: '-36.8, -73.0' }),
      // línea de 2 vértices: mismo id+path, metadata idéntica
      makeRow({ Id_Investment: 'CHL-0003', Id_Seq: 3, Vector: 'Vector', Path: 1, Coordinates: '-33.0, -71.0' }),
      makeRow({ Id_Investment: 'CHL-0003', Id_Seq: 3, Vector: 'Vector', Path: 1, Coordinates: '-33.1, -71.1' })
    ]
    const r = run(rows)
    expect(r.fileErrors).toEqual([])
    expect(errorsOf(r)).toEqual([])
    expect(r.stats.passed).toBe(true)
    expect(r.stats.validPct).toBe(100)
  })
})

describe('reglas de archivo', () => {
  it('columna prohibida = fileError, falla aunque filas 100% válidas', () => {
    const r = run([makeRow({ Investment_ARREGLADO: 100 })])
    expect(r.fileErrors.some((f) => f.rule === 'archivo/columna-prohibida')).toBe(true)
    expect(r.stats.passed).toBe(false)
  })

  it('columna requerida ausente = fileError', () => {
    const row = makeRow()
    delete row.Year
    const r = run([row])
    expect(r.fileErrors.some((f) => f.rule === 'archivo/columna-requerida' && f.message.includes('Year'))).toBe(true)
  })

  it('nombre de archivo fuera de convención = fileError', () => {
    const r = validateRows([makeRow()], { filename: 'Datos Chile (final).xlsx' })
    expect(r.fileErrors.some((f) => f.rule === 'archivo/nombre')).toBe(true)
  })

  it('convención vieja (español minúscula) ya no es canónica', () => {
    const r = validateRows([makeRow()], { filename: 'chile.xlsx' })
    expect(r.fileErrors.some((f) => f.rule === 'archivo/nombre')).toBe(true)
    // pero como agregado: no exige país único
    expect(rules(errorsOf(r))).not.toContain('fila/pais-archivo')
  })

  it('convención cliente (MAYÚSCULA inglés) es canónica y exige país del archivo', () => {
    const ok = validateRows([makeRow()], { filename: 'CHILE.xlsx' })
    expect(ok.fileErrors.some((f) => f.rule === 'archivo/nombre')).toBe(false)
    const cross = validateRows([makeRow()], { filename: 'BRAZIL.xlsx' })
    expect(rules(errorsOf(cross))).toContain('fila/pais-archivo')
  })

  it('más de una hoja = fileError', () => {
    const r = run([makeRow()], { sheetCount: 2 })
    expect(r.fileErrors.some((f) => f.rule === 'archivo/hojas')).toBe(true)
  })

  it('Id_Seq/News ausentes = warning de archivo (contrato en adopción), no error', () => {
    const row = makeRow()
    delete row.Id_Seq
    delete row.News
    const r = run([row])
    expect(r.fileErrors).toEqual([])
    expect(rules(warningsOf(r))).toContain('archivo/columna-nueva-ausente')
  })

  it('columna extra desconocida = info, permitida', () => {
    const r = run([makeRow({ Location_ES: 'Santiago' })])
    expect(r.fileErrors).toEqual([])
    expect(r.issues.some((x) => x.severity === 'info' && x.rule === 'archivo/columna-extra')).toBe(true)
  })
})

describe('reglas de fila (errores)', () => {
  it('Year fuera de rango', () => {
    const r = run([makeRow({ Year: 1830 }), makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Year: 299 })])
    expect(errorsOf(r).filter((x) => x.rule === 'fila/year')).toHaveLength(2)
  })

  it('coordenadas no parseables o fuera de rango', () => {
    const r = run([makeRow({ Coordinates: 'ver mapa' }), makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Coordinates: '-133, -70' })])
    expect(errorsOf(r).filter((x) => x.rule === 'fila/coordenadas')).toHaveLength(2)
  })

  it('lat/lng invertidas = warning heurística LATAM', () => {
    // La Paz invertida: lng -17.4 queda fuera del rango esperado (lng < -30)
    const r = run([makeRow({ Coordinates: '-68.15, -16.5' })])
    expect(rules(warningsOf(r))).toContain('fila/coordenadas-sospechosas')
  })

  it('Area_EN con valor ES, typo o Services, con hint', () => {
    const r = run([
      makeRow({ Area_EN: 'Energía' }),
      makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Area_EN: 'Energy ' }),
      makeRow({ Id_Investment: 'CHL-0003', Id_Seq: 3, Area_EN: 'Services' }),
      makeRow({ Id_Investment: 'CHL-0004', Id_Seq: 4, Area_EN: 'RealEstate', Area_ES: 'Bienes Raíces' })
    ])
    const errs = errorsOf(r).filter((x) => x.rule === 'fila/sector-en')
    expect(errs).toHaveLength(4)
    expect(errs[0].message).toContain('"Energy"') // hint del valor ES
    expect(errs[1].message).toContain('espacios de más')
    expect(errs[2].message).toContain('rechazado por la metodología')
    expect(errs[3].message).toContain('Real Estate')
  })

  it('Area_ES no pareada con Area_EN', () => {
    const r = run([makeRow({ Area_ES: 'Minería' })])
    expect(rules(errorsOf(r))).toContain('fila/sector-es')
  })

  it('Project_Type typo con hint', () => {
    const r = run([makeRow({ Project_Type: 'Adquisión' })])
    const err = errorsOf(r).find((x) => x.rule === 'fila/project-type')
    expect(err?.message).toContain('¿quiso decir "Adquisición"?')
  })

  it('Vector/Path inconsistentes', () => {
    const r = run([
      makeRow({ Vector: '0' }),
      makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Path: 3 }), // Punto con Path 3
      makeRow({ Id_Investment: 'CHL-0003', Id_Seq: 3, Vector: 'Vector', Path: 0 })
    ])
    expect(rules(errorsOf(r))).toContain('fila/vector')
    expect(errorsOf(r).filter((x) => x.rule === 'fila/path')).toHaveLength(2)
  })

  it('ISO inconsistente con país', () => {
    const r = run([makeRow({ COUNTRY_ISO_ALPHA3: 'ARG' }), makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, COUNTRY_ISO_NUM: '32' })])
    expect(rules(errorsOf(r))).toContain('fila/iso-alpha3')
    expect(rules(errorsOf(r))).toContain('fila/iso-num')
  })

  it('requerido vacío', () => {
    const r = run([makeRow({ Investor: '  ' })])
    expect(rules(errorsOf(r))).toContain('fila/requerido-vacio')
  })

  it('Investment negativo y Stake fuera de rango', () => {
    const r = run([makeRow({ Investment: -5, Stake: 130 })])
    expect(rules(errorsOf(r))).toContain('fila/monto')
    expect(rules(errorsOf(r))).toContain('fila/stake')
  })

  it('país distinto al del archivo (flujo por país)', () => {
    const r = run([makeRow({ Country: 'Peru', COUNTRY_ISO_NUM: '604', COUNTRY_ISO_ALPHA3: 'PER', Id_Investment: 'PER-0001' })])
    expect(rules(errorsOf(r))).toContain('fila/pais-archivo')
  })

  it('archivo agregado (nombre no canónico) no exige país único, sí cadena por fila', () => {
    const r = validateRows(
      [makeRow(), makeRow({ Id_Investment: 'PER-0001', Id_Seq: 1, Country: 'Peru', COUNTRY_ISO_NUM: '604', COUNTRY_ISO_ALPHA3: 'PER' })],
      { filename: 'AUDITADO_COMPLETO.xlsx' }
    )
    expect(rules(errorsOf(r))).not.toContain('fila/pais-archivo')
    // el nombre no canónico igual se reporta como fileError de nombre
    expect(r.fileErrors.some((f) => f.rule === 'archivo/nombre')).toBe(true)
  })
})

describe('ids', () => {
  it('formato legado = warning con strictIds off, error con on', () => {
    const rows = [makeRow({ Id_Investment: '0019155', Id_Seq: null })]
    expect(rules(warningsOf(run(rows)))).toContain('fila/id-formato')
    expect(rules(errorsOf(run(rows, { strictIds: true })))).toContain('fila/id-formato')
  })

  it('prefijo != país = error siempre', () => {
    const r = run([makeRow({ Id_Investment: 'ARG-0001' })])
    expect(rules(errorsOf(r))).toContain('fila/id-prefijo')
  })

  it('Id_Investment inconsistente con Id_Seq', () => {
    const r = run([makeRow({ Id_Seq: 7 })]) // CHL-0001 vs esperado CHL-0007
    expect(rules(errorsOf(r))).toContain('fila/id-seq')
  })

  it('colisión: mismo id en dos países = error siempre (caso 0019100)', () => {
    const r = validateRows(
      [
        makeRow({ Id_Investment: '0019100', Id_Seq: null, Country: 'Colombia', COUNTRY_ISO_NUM: '170', COUNTRY_ISO_ALPHA3: 'COL' }),
        makeRow({ Id_Investment: '0019100', Id_Seq: null, Country: 'Venezuela', COUNTRY_ISO_NUM: '862', COUNTRY_ISO_ALPHA3: 'VEN', Coordinates: '8.5, -66.0' })
      ],
      { filename: 'base.xlsx' }
    )
    expect(rules(errorsOf(r))).toContain('fila/id-colision')
  })

  it('monto distinto entre filas del mismo id = warning sobreconteo', () => {
    const r = run([
      makeRow({ Vector: 'Vector', Path: 1 }),
      makeRow({ Vector: 'Vector', Path: 1, Coordinates: '-33.5, -70.7', Investment: 999 })
    ])
    expect(rules(warningsOf(r))).toContain('fila/monto-inconsistente')
  })
})

describe('citas Research/News', () => {
  it('CasoN poblado sin Research=Yes ni News=Yes = warning cita invisible', () => {
    const r = run([makeRow({ Caso1: 'Informe CEPAL 2024', Link1: 'https://cepal.org/x' })])
    expect(rules(warningsOf(r))).toContain('fila/cita-invisible')
  })

  it('URL en CasoN = warning', () => {
    const r = run([makeRow({ Caso1: 'https://cepal.org/x', Research: 'Yes' })])
    expect(rules(warningsOf(r))).toContain('fila/caso-url')
  })

  it('Location con URL = warning', () => {
    const r = run([makeRow({ Location: 'https://maps.google.com/xyz' })])
    expect(rules(warningsOf(r))).toContain('fila/location-url')
  })
})

describe('geometría compartida', () => {
  it('2 ids con ≥2 coords idénticas = warning; 1 coord = silencio', () => {
    const shared = run([
      makeRow({ Vector: 'Vector', Path: 1 }),
      makeRow({ Vector: 'Vector', Path: 1, Coordinates: '-33.5, -70.7' }),
      makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Vector: 'Vector', Path: 1 }),
      makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2, Vector: 'Vector', Path: 1, Coordinates: '-33.5, -70.7' })
    ])
    expect(rules(warningsOf(shared))).toContain('archivo/geometria-compartida')

    const single = run([
      makeRow(),
      makeRow({ Id_Investment: 'CHL-0002', Id_Seq: 2 }) // comparte solo 1 coord
    ])
    expect(rules(warningsOf(single))).not.toContain('archivo/geometria-compartida')
  })
})

describe('umbral', () => {
  it('96% válidas pasa, 94% falla (umbral 95)', () => {
    const mk = (n, bad) =>
      Array.from({ length: n }, (_, i) =>
        makeRow({ Id_Investment: `CHL-${String(i + 1).padStart(4, '0')}`, Id_Seq: i + 1, Year: i < bad ? 1800 : 2020 })
      )
    expect(run(mk(50, 2)).stats.passed).toBe(true) // 96%
    expect(run(mk(50, 3)).stats.passed).toBe(false) // 94%
  })

  it('filas en blanco no cuentan al umbral', () => {
    const blank = Object.fromEntries(Object.keys(makeRow()).map((k) => [k, null]))
    const r = run([makeRow(), blank])
    expect(r.stats.consideredRows).toBe(1)
    expect(r.stats.validPct).toBe(100)
  })
})
