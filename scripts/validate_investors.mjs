#!/usr/bin/env node
// Valida la TABLA DE INVERSORES (data/schema/investors_map.csv) contra las reglas
// de scripts/lib/validate_investors.mjs. Corre junto al validador de datos por
// país (misma CI). Exit 1 si hay errores.
//
// Uso: node scripts/validate_investors.mjs [ruta.csv]
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateInvestors } from './lib/validate_investors.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const csvPath = resolve(process.cwd(), process.argv[2] || resolve(REPO_ROOT, 'data/schema/investors_map.csv'))

if (!existsSync(csvPath)) {
  console.log(`validate_investors: no existe ${csvPath}. OK (nada que validar).`)
  process.exit(0)
}

// CSV con comillas (members lleva comas).
const parseLine = (line) => {
  const cells = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { cells.push(cur); cur = '' }
    else cur += ch
  }
  cells.push(cur)
  return cells
}

const lines = readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n').trim().split('\n')
const header = parseLine(lines[0])
const rows = lines.slice(1).map((l) => {
  const c = parseLine(l)
  return Object.fromEntries(header.map((h, i) => [h, c[i] ?? null]))
})

const { issues, stats } = validateInvestors(rows)

console.log(`\n═══ investors_map.csv (${stats.rows} filas) ═══`)
const byRule = new Map()
for (const it of issues) {
  if (!byRule.has(it.rule)) byRule.set(it.rule, [])
  byRule.get(it.rule).push(it)
}
const order = [...byRule.entries()].sort((a, b) => {
  const sev = (xs) => (xs.some((x) => x.severity === 'error') ? 0 : 1)
  return sev(a[1]) - sev(b[1]) || b[1].length - a[1].length
})
for (const [rule, items] of order) {
  const icon = items[0].severity === 'error' ? '✗' : '⚠'
  console.log(`  ${icon} [${rule}] ${items.length} caso(s):`)
  for (const it of items.slice(0, 15)) {
    const loc = it.row > 0 ? `fila ${it.row}` : 'archivo'
    console.log(`      ${loc}: ${it.message}`)
  }
  if (items.length > 15) console.log(`      … y ${items.length - 15} más.`)
}
console.log(`  ── ${stats.rows} filas · ${stats.errors} errores · ${stats.warnings} advertencias → ${stats.passed ? 'PASA ✔' : 'FALLA ✗'}`)

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n## Tabla de inversores\n\n${stats.rows} filas · ${stats.errors} errores · ${stats.warnings} advertencias → ${stats.passed ? '✅ pasa' : '❌ falla'}\n`
  )
}

process.exit(stats.passed ? 0 : 1)
