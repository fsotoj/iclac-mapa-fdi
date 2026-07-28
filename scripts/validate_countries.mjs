#!/usr/bin/env node
// Valida el REGISTRO DE PAÍSES (data/schema/countries.csv) contra las reglas de
// scripts/lib/validate_countries.mjs. Corre en la misma CI que el validador de
// datos por país. Exit 1 si hay errores.
//
// Ese archivo define dos cosas de las que depende todo lo demás: qué países
// existen para el proyecto y cuáles se publican. Si se rompe, el mapa se queda
// sin países sin que nada más falle.
//
// Uso: node scripts/validate_countries.mjs [ruta.csv]
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCountries } from './lib/validate_countries.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const csvPath = resolve(process.cwd(), process.argv[2] || resolve(REPO_ROOT, 'data/schema/countries.csv'))

if (!existsSync(csvPath)) {
  console.error(`validate_countries: falta ${csvPath}. Sin registro de países no hay alcance que validar.`)
  process.exit(1)
}

const { issues, stats } = validateCountries(readFileSync(csvPath, 'utf8'))

console.log(`\n═══ countries.csv (${stats.rows} filas) ═══`)
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
  console.log(`  ${items[0].severity === 'error' ? '✗' : '⚠'} [${rule}] ${items.length} caso(s):`)
  for (const it of items.slice(0, 15)) console.log(`      ${it.row > 0 ? `fila ${it.row}` : 'archivo'}: ${it.message}`)
  if (items.length > 15) console.log(`      … y ${items.length - 15} caso(s) más.`)
}

console.log(
  `  ── ${stats.rows} filas · ${stats.publicados} se publican · ${stats.retenidos} retenidos · ` +
  `${stats.errors} errores · ${stats.warnings} advertencias → ${stats.passed ? 'PASA ✔' : 'FALLA ✗'}`
)

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n## Registro de países\n\n${stats.rows} países · **${stats.publicados} publicados**, ${stats.retenidos} retenidos · ` +
    `${stats.errors} errores, ${stats.warnings} advertencias → ${stats.passed ? '✅ pasa' : '❌ falla'}\n`
  )
}

process.exit(stats.passed ? 0 : 1)
