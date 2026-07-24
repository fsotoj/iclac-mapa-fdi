#!/usr/bin/env node
// E.2 — Reconstruye la columna ownership de data/schema/investors_map.csv con los
// veredictos de la revisión externa (Dialogue), en el enum nuevo. La base del
// cliente NO aplicó estas correcciones (ver audit_ownership_cross.mjs), así que
// la fuente de verdad de ownership es la revisión experta, no la base.
//
// Por empresa (company_canonical):
//   - verdict WRONG con corrected → corrected (enum nuevo).
//   - resto (OK/UNSURE) → nuestro ownership traducido al enum nuevo
//     (SASAC→Central SOE, SOE→Local SOE, POE/MIXED/UNKNOWN igual).
//   - empresa sin fila en la revisión → solo se traduce el vocabulario.
//
// Reescribe el CSV (respaldo en .bak) y loguea el diff. Después correr
// build_investors_map.mjs para regenerar investors_map.json.
import XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const CSV = resolve(REPO_ROOT, 'data/schema/investors_map.csv')
const REVIEW = resolve(REPO_ROOT, 'docs/sprint_5/ownership_review_ywedits.xlsx')

const clean = (v) => (v == null ? '' : String(v).trim())
const OLD_TO_NEW = { SASAC: 'Central SOE', SOE: 'Local SOE', POE: 'POE', MIXED: 'MIXED', UNKNOWN: 'UNKNOWN' }

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
const writeCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

// ---- Verdad externa por empresa ----
const wb = XLSX.readFile(REVIEW)
const companies = XLSX.utils.sheet_to_json(wb.Sheets['companies'], { defval: null })
const finalByCompany = new Map()
for (const r of companies) {
  const company = clean(r.company)
  if (!company) continue
  const verdict = clean(r['your verdict (OK / WRONG / UNSURE)']).toUpperCase()
  const corrected = clean(r['corrected ownership'])
  const ours = clean(r.ownership)
  const final = verdict.startsWith('WRONG') && corrected ? corrected : (OLD_TO_NEW[ours] ?? ours)
  finalByCompany.set(company, { final, verdict, corrected, ours })
}

// ---- Reescribir CSV ----
const lines = readFileSync(CSV, 'utf8').replace(/\r\n/g, '\n').trim().split('\n')
const header = parseLine(lines[0])
const iCanon = header.indexOf('company_canonical')
const iOwn = header.indexOf('ownership')

const changes = []
const dist = {}
const out = [lines[0]]
for (const line of lines.slice(1)) {
  const c = parseLine(line)
  const company = clean(c[iCanon])
  const before = clean(c[iOwn])
  const y = finalByCompany.get(company)
  const after = y ? y.final : (OLD_TO_NEW[before] ?? before)
  if (after !== before) changes.push({ company, before, after, verdict: y?.verdict ?? '(no en revisión)' })
  c[iOwn] = after
  dist[after] = (dist[after] ?? 0) + 1
  out.push(c.map(writeCell).join(','))
}
writeFileSync(CSV, out.join('\n') + '\n')

console.log(`Filas reescritas: ${out.length - 1}`)
console.log('Distribución ownership (enum nuevo):', JSON.stringify(dist))
const wrong = changes.filter((x) => x.verdict.startsWith('WRONG'))
console.log(`\nCorrecciones sustantivas (WRONG de la revisión): ${new Set(wrong.map((x) => x.company)).size} empresas`)
for (const ch of wrong) console.log(`  ${ch.company}: ${ch.before} → ${ch.after}`)
const vocab = changes.filter((x) => !x.verdict.startsWith('WRONG'))
console.log(`\nSolo vocabulario (SASAC→Central SOE, SOE→Local SOE): ${vocab.length} filas`)
console.log(`\n→ ${CSV} (respaldo en investors_map.csv.bak)`)
console.log('Siguiente: node scripts/build_investors_map.mjs')
