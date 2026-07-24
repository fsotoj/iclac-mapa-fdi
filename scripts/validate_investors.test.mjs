import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateInvestors } from './lib/validate_investors.mjs'

const rules = (r) => r.issues.map((x) => x.rule)
const errors = (r) => r.issues.filter((x) => x.severity === 'error')

// Fila válida de la tabla de inversores. Overrides por test.
const row = (over = {}) => ({
  investor_raw: 'State Grid',
  company_id: 'state-grid',
  company_canonical: 'State Grid',
  is_consortium: 'false',
  members: '',
  ownership: 'Central SOE',
  ...over
})

describe('tabla de inversores válida', () => {
  it('filas correctas pasan', () => {
    const r = validateInvestors([row(), row({ investor_raw: 'CNPC', company_id: 'cnpc', company_canonical: 'CNPC' })])
    expect(errors(r)).toEqual([])
    expect(r.stats.passed).toBe(true)
  })
})

describe('reglas', () => {
  it('ownership fuera del enum = error', () => {
    const r = validateInvestors([row({ ownership: 'SASAC' })])
    expect(rules(r)).toContain('fila/ownership')
  })

  it('is_consortium no booleano = error', () => {
    const r = validateInvestors([row({ is_consortium: 'sí' })])
    expect(rules(r)).toContain('fila/consorcio')
  })

  it('investor_raw duplicado = error', () => {
    const r = validateInvestors([row(), row({ company_id: 'x', company_canonical: 'X' })])
    expect(rules(r)).toContain('fila/raw-duplicado')
  })

  it('mismo company_id con dos company_canonical = error (colisión real hallada 24-07)', () => {
    const r = validateInvestors([
      row({ investor_raw: 'A', company_id: 'dup', company_canonical: 'Consorcio A' }),
      row({ investor_raw: 'B', company_id: 'dup', company_canonical: 'Consorcio B' })
    ])
    expect(rules(r)).toContain('fila/id-multi-canonico')
  })

  it('ownership inconsistente por company_id = error', () => {
    const r = validateInvestors([
      row({ investor_raw: 'A', company_id: 'acme', company_canonical: 'Acme', ownership: 'POE' }),
      row({ investor_raw: 'B', company_id: 'acme', company_canonical: 'Acme', ownership: 'Central SOE' })
    ])
    expect(rules(r)).toContain('empresa/ownership-inconsistente')
  })

  it('consorcio sin members = warning', () => {
    const r = validateInvestors([row({ is_consortium: 'true', members: '' })])
    expect(r.issues.some((x) => x.severity === 'warning' && x.rule === 'fila/consorcio-sin-miembros')).toBe(true)
  })

  it('columna requerida ausente = error', () => {
    const bad = row()
    delete bad.ownership
    const r = validateInvestors([bad])
    expect(rules(r)).toContain('archivo/columna-requerida')
  })
})

describe('el investors_map.csv real pasa el validador', () => {
  it('sin errores', () => {
    const csv = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data/schema/investors_map.csv')
    const parseLine = (line) => {
      const c = []
      let cur = ''
      let q = false
      for (const ch of line) {
        if (ch === '"') q = !q
        else if (ch === ',' && !q) { c.push(cur); cur = '' }
        else cur += ch
      }
      c.push(cur)
      return c
    }
    const lines = readFileSync(csv, 'utf8').replace(/\r\n/g, '\n').trim().split('\n')
    const header = parseLine(lines[0])
    const rows = lines.slice(1).map((l) => {
      const c = parseLine(l)
      return Object.fromEntries(header.map((h, i) => [h, c[i] ?? null]))
    })
    const r = validateInvestors(rows)
    if (!r.stats.passed) console.error(errors(r).map((e) => e.message))
    expect(r.stats.passed).toBe(true)
  })
})
