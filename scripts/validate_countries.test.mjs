import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCountries } from './lib/validate_countries.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const HEADER = 'alpha3,numeric,name,aliases,filename,publish'
const csv = (...rows) => [HEADER, ...rows].join('\n')
const rules = (r) => r.issues.map((x) => x.rule)
const errorsOf = (r) => r.issues.filter((x) => x.severity === 'error')

describe('registro válido', () => {
  it('pasa y cuenta publicados vs retenidos', () => {
    const r = validateCountries(csv('CHL,152,Chile,,CHILE,yes', 'HND,340,Honduras,,HONDURAS,no'))
    expect(r.stats.passed).toBe(true)
    expect(r.stats.publicados).toBe(1)
    expect(r.stats.retenidos).toBe(1)
  })

  it('el countries.csv real del repo pasa', () => {
    const r = validateCountries(readFileSync(resolve(REPO_ROOT, 'data/schema/countries.csv'), 'utf8'))
    if (!r.stats.passed) console.error(errorsOf(r))
    expect(r.stats.passed).toBe(true)
  })
})

describe('daños de abrir el archivo en Excel', () => {
  it('separador punto y coma = error con la causa nombrada', () => {
    const r = validateCountries('alpha3;numeric;name;aliases;filename;publish\nCHL;152;Chile;;CHILE;yes')
    expect(rules(r)).toContain('archivo/separador')
    expect(errorsOf(r)[0].message).toMatch(/Excel/)
  })

  it('cero a la izquierda comido = error, y dice cuál debería ser', () => {
    const r = validateCountries(csv('ARG,32,Argentina,,ARGENTINA,yes'))
    const e = errorsOf(r).find((x) => x.rule === 'fila/numeric')
    expect(e?.message).toContain('"032"')
  })

  it('BOM al inicio no rompe la cabecera', () => {
    const r = validateCountries('﻿' + csv('CHL,152,Chile,,CHILE,yes'))
    expect(r.stats.passed).toBe(true)
  })
})

describe('integridad del registro', () => {
  it('alpha3 duplicado = error que apunta a la otra fila', () => {
    const r = validateCountries(csv('CHL,152,Chile,,CHILE,yes', 'CHL,153,Chile Dos,,CHILE_DOS,yes'))
    expect(errorsOf(r).find((x) => x.rule === 'fila/alpha3-duplicado')?.message).toContain('fila 2')
  })

  it('dos países con el mismo filename = error', () => {
    const r = validateCountries(csv('CHL,152,Chile,,CHILE,yes', 'ARG,032,Argentina,,CHILE,yes'))
    expect(rules(r)).toContain('fila/filename-duplicado')
  })

  it('alpha3 en minúscula = error', () => {
    expect(rules(validateCountries(csv('chl,152,Chile,,CHILE,yes')))).toContain('fila/alpha3')
  })
})

describe('la compuerta publish', () => {
  it('un valor que no es yes/no es error, porque se leería como yes', () => {
    const r = validateCountries(csv('CHL,152,Chile,,CHILE,si'))
    expect(errorsOf(r).find((x) => x.rule === 'fila/publish')?.message).toMatch(/yes/)
  })

  it('celda vacía publica, con aviso', () => {
    const r = validateCountries(csv('CHL,152,Chile,,CHILE,'))
    expect(rules(r)).toContain('fila/publish-vacio')
    expect(r.stats.publicados).toBe(1)
    expect(r.stats.passed).toBe(true)
  })

  it('sin la columna publish, todos publican y se avisa una sola vez', () => {
    const r = validateCountries('alpha3,numeric,name,aliases,filename\nCHL,152,Chile,,CHILE\nARG,032,Argentina,,ARGENTINA')
    expect(r.issues.filter((x) => x.rule === 'archivo/sin-publish')).toHaveLength(1)
    expect(r.stats.publicados).toBe(2)
    expect(r.stats.passed).toBe(true)
  })
})
