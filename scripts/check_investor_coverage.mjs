#!/usr/bin/env node
// Cobertura de inversores: lista los Investor de la base que NO están en
// investors_map (identidad + ownership). Esos caen a UNKNOWN en el Sankey/filtro.
//
// Es el mecanismo de degradación elegante para el handover: el mapa nunca se
// rompe con un inversor nuevo (cuenta como UNKNOWN); este chequeo le dice al
// steward de la tabla exactamente qué inversores necesitan veredicto de ownership.
// investors_map lo cura quien tiene la expertise (Dialogue/Francisco), no el
// data-entry ni nosotros — ver schema §5.1 / next_steps C10.
//
// Uso:
//   node scripts/check_investor_coverage.mjs [investments.json] [investors_map.json]
//   (defaults: public/data/*)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const invPath = resolve(process.cwd(), process.argv[2] || resolve(REPO_ROOT, 'public/data/investments.json'))
const mapPath = resolve(process.cwd(), process.argv[3] || resolve(REPO_ROOT, 'public/data/investors_map.json'))
const OUT = resolve(REPO_ROOT, 'docs/sprint_5/cobertura_inversores.xlsx')

if (!existsSync(invPath) || !existsSync(mapPath)) {
  console.error(`Falta ${!existsSync(invPath) ? invPath : mapPath}. Correr el ETL primero.`)
  process.exit(1)
}
const investments = JSON.parse(readFileSync(invPath, 'utf8'))
const investorMap = JSON.parse(readFileSync(mapPath, 'utf8'))
const known = new Set(Object.keys(investorMap))

// Agrega por Investor: features, inversiones únicas (dedup por id), monto (dedup por id).
const agg = new Map()
const seenAmount = new Set() // `${investor}|${id}` para no sobrecontar multi-punto
for (const inv of investments) {
  const name = inv.investor ?? null
  if (!name) continue
  if (!agg.has(name)) agg.set(name, { features: 0, ids: new Set(), musd: 0 })
  const e = agg.get(name)
  e.features += 1
  e.ids.add(inv.id)
  const k = `${name}|${inv.id}`
  if (!seenAmount.has(k)) {
    seenAmount.add(k)
    if (typeof inv.investment_musd === 'number') e.musd += inv.investment_musd
  }
}

const rows = [...agg.entries()].map(([investor, e]) => ({
  investor,
  mapeado: known.has(investor) ? 'sí' : 'NO',
  ownership: known.has(investor) ? (investorMap[investor].ownership ?? '') : '(UNKNOWN por defecto)',
  inversiones: e.ids.size,
  features: e.features,
  musd: Math.round(e.musd)
}))
const unmapped = rows.filter((r) => r.mapeado === 'NO').sort((a, b) => b.musd - a.musd || b.inversiones - a.inversiones)

const totalInvestors = rows.length
const totalInvestments = new Set(investments.map((x) => x.id)).size
const mappedInvestments = new Set(investments.filter((x) => known.has(x.investor)).map((x) => x.id)).size
const cov = totalInvestments ? ((mappedInvestments / totalInvestments) * 100).toFixed(1) : '100'

console.log('=== Cobertura de inversores (investors_map) ===')
console.log(`Inversores distintos: ${totalInvestors} · sin mapear: ${unmapped.length}`)
console.log(`Inversiones con inversor mapeado: ${mappedInvestments}/${totalInvestments} (${cov}%)`)
console.log('\nSin mapear (caen a UNKNOWN — necesitan veredicto de ownership):')
for (const r of unmapped) console.log(`  ${r.investor} — ${r.inversiones} inv · US$${r.musd} M`)

const wbo = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  wbo,
  XLSX.utils.aoa_to_sheet([
    ['Métrica', 'Valor'],
    ['Inversores distintos', totalInvestors],
    ['Sin mapear', unmapped.length],
    ['Cobertura de inversiones', `${mappedInvestments}/${totalInvestments} (${cov}%)`]
  ]),
  'resumen'
)
XLSX.utils.book_append_sheet(wbo, XLSX.utils.json_to_sheet(unmapped), 'sin_mapear')
XLSX.utils.book_append_sheet(wbo, XLSX.utils.json_to_sheet(rows.sort((a, b) => b.musd - a.musd)), 'todos')
XLSX.writeFile(wbo, OUT)
console.log(`\n→ ${OUT}`)
process.exit(0)
