#!/usr/bin/env node
// E.1 — Verifica que la base del cliente aplicó bien los veredictos de ownership
// de la revisión externa (Dialogue) ANTES de reconstruir investors_map.csv.
// Solo lectura + informe. No toca datos.
//
// Cruza tres fuentes por empresa canónica:
//   - Veredicto externo: docs/sprint_5/ownership_review_ywedits.xlsx (hoja companies)
//       verdict OK/WRONG/UNSURE + corrected ownership (vocabulario nuevo).
//   - Mapa investor_raw -> company_canonical: hoja raw_mapping del mismo xlsx
//       (= el investors_map.csv que enviamos).
//   - Ownership que puso el cliente en la base: columna Ownership de los xlsx por país.
//
// Uso: node scripts/audit_ownership_cross.mjs <dirBaseXlsx>
// Salida: docs/sprint_5/auditoria_ownership_cross.xlsx + resumen en consola.
import XLSX from 'xlsx'
import { readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const REVIEW = resolve(REPO_ROOT, 'docs/sprint_5/ownership_review_ywedits.xlsx')
const OUT = resolve(REPO_ROOT, 'docs/sprint_5/auditoria_ownership_cross.xlsx')

const dataDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null
if (!dataDir || !existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
  console.error('Uso: node scripts/audit_ownership_cross.mjs <dirBaseXlsx>')
  process.exit(1)
}

const clean = (v) => (v == null ? null : String(v).trim() || null)
const ENUM = ['Central SOE', 'Local SOE', 'POE', 'MIXED', 'UNKNOWN']
// Vocabulario viejo (nuestro/raw_mapping) -> nuevo (Yifang).
const OLD_TO_NEW = { SASAC: 'Central SOE', SOE: 'Local SOE', POE: 'POE', MIXED: 'MIXED', UNKNOWN: 'UNKNOWN' }
// Base del cliente: 'SOE' a secas = no adoptó 'Local SOE' (gap de vocabulario, no de sustancia).
const baseToNew = (v) => (v === 'SOE' ? 'Local SOE' : v)

// ---- Fuente externa ----
const wb = XLSX.readFile(REVIEW)
const companies = XLSX.utils.sheet_to_json(wb.Sheets['companies'], { defval: null })
const rawMap = XLSX.utils.sheet_to_json(wb.Sheets['raw_mapping'], { defval: null })

// Verdad externa por empresa canónica (vocabulario nuevo).
const yifangByCompany = new Map()
for (const r of companies) {
  const company = clean(r.company)
  if (!company) continue
  const verdict = (clean(r['your verdict (OK / WRONG / UNSURE)']) || '').toUpperCase()
  const corrected = clean(r['corrected ownership'])
  const ours = clean(r.ownership)
  const isWrong = verdict.startsWith('WRONG')
  const final = isWrong && corrected ? corrected : OLD_TO_NEW[ours] ?? ours
  yifangByCompany.set(company, {
    final,
    verdict: verdict || '(vacío)',
    corrected,
    ours,
    n: r['investments (n)'] ?? null,
    musd: r['total (US$ M)'] ?? null
  })
}

// investor_raw -> company_canonical (lo que enviamos) + canónico->canónico
// (la base usa el nombre canónico como Investor, no el raw).
const rawToCompany = new Map()
for (const r of rawMap) {
  const raw = clean(r.investor_raw)
  const canon = clean(r.company_canonical)
  if (raw && canon) rawToCompany.set(raw, canon)
  if (canon) rawToCompany.set(canon, canon)
}

// ---- Ownership que puso el cliente en la base, por empresa ----
const baseByCompany = new Map() // company -> Map(ownership -> conteo)
const unmatchedInvestors = new Map()
for (const f of readdirSync(dataDir).filter((x) => x.endsWith('.xlsx') && !x.startsWith('~$'))) {
  const w = XLSX.readFile(resolve(dataDir, f))
  const rows = XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]], { defval: null })
  for (const row of rows) {
    const inv = clean(row.Investor)
    const own = clean(row.Ownership)
    if (!inv) continue
    const company = rawToCompany.get(inv) ?? null
    if (!company) {
      unmatchedInvestors.set(inv, (unmatchedInvestors.get(inv) ?? 0) + 1)
      continue
    }
    if (!baseByCompany.has(company)) baseByCompany.set(company, new Map())
    const m = baseByCompany.get(company)
    m.set(own, (m.get(own) ?? 0) + 1)
  }
}
const baseOwnOf = (company) => {
  const m = baseByCompany.get(company)
  if (!m) return null
  // moda
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// ---- Cruce ----
const rows = []
const buckets = { MATCH: 0, VOCAB: 0, MISMATCH: 0, BASE_ONLY: 0, EXTERNAL_ONLY: 0 }
const allCompanies = new Set([...yifangByCompany.keys(), ...baseByCompany.keys()])
for (const company of allCompanies) {
  const y = yifangByCompany.get(company)
  const baseRaw = baseOwnOf(company)
  if (!y && baseRaw) {
    buckets.BASE_ONLY++
    rows.push({ company, estado: 'BASE_ONLY', base: baseRaw, externo: '', veredicto: '', nota: 'empresa en la base, no en la revisión externa' })
    continue
  }
  if (y && !baseRaw) {
    buckets.EXTERNAL_ONLY++
    rows.push({ company, estado: 'EXTERNAL_ONLY', base: '', externo: y.final, veredicto: y.verdict, nota: 'en la revisión, sin ownership en la base (o investor no matchea)' })
    continue
  }
  if (!y || !baseRaw) continue
  const baseNew = baseToNew(baseRaw)
  const vocabGap = baseRaw === 'SOE' && y.final === 'Local SOE'
  let estado
  if (baseNew === y.final) estado = vocabGap ? 'VOCAB' : 'MATCH'
  else estado = 'MISMATCH'
  buckets[estado]++
  rows.push({
    company,
    estado,
    base: baseRaw,
    externo: y.final,
    veredicto: y.verdict,
    corregido: y.corrected ?? '',
    nuestro_previo: y.ours ?? '',
    n: y.n ?? '',
    musd: y.musd ?? '',
    nota: estado === 'MISMATCH' ? 'la base NO coincide con el veredicto externo' : estado === 'VOCAB' ? 'sustancia OK, falta renombrar SOE→Local SOE' : ''
  })
}

// Orden: MISMATCH primero, luego VOCAB, EXTERNAL_ONLY, BASE_ONLY, MATCH.
const order = { MISMATCH: 0, EXTERNAL_ONLY: 1, VOCAB: 2, BASE_ONLY: 3, MATCH: 4 }
rows.sort((a, b) => (order[a.estado] - order[b.estado]) || String(a.company).localeCompare(b.company))

console.log('=== Cruce ownership base vs revisión externa ===')
console.log(buckets)
console.log(`Investors de la base sin match a company: ${unmatchedInvestors.size} distintos`)
console.log('\nMISMATCH (base no aplicó el veredicto):')
for (const r of rows.filter((x) => x.estado === 'MISMATCH'))
  console.log(`  ${r.company}: base="${r.base}" vs externo="${r.externo}" (veredicto ${r.veredicto}${r.corregido ? ', corregido→' + r.corregido : ''})`)

// ---- xlsx ----
const wbo = XLSX.utils.book_new()
const summary = [
  ['Estado', 'Empresas', 'Significado'],
  ['MATCH', buckets.MATCH, 'la base coincide con el veredicto externo'],
  ['VOCAB', buckets.VOCAB, 'sustancia OK; la base usa SOE donde va Local SOE'],
  ['MISMATCH', buckets.MISMATCH, 'la base NO coincide: no se aplicó el veredicto'],
  ['EXTERNAL_ONLY', buckets.EXTERNAL_ONLY, 'en la revisión, sin ownership en la base'],
  ['BASE_ONLY', buckets.BASE_ONLY, 'en la base, sin fila en la revisión'],
  [],
  ['Investors sin match a company', unmatchedInvestors.size, '']
]
XLSX.utils.book_append_sheet(wbo, XLSX.utils.aoa_to_sheet(summary), 'resumen')
XLSX.utils.book_append_sheet(wbo, XLSX.utils.json_to_sheet(rows), 'cruce')
XLSX.utils.book_append_sheet(
  wbo,
  XLSX.utils.json_to_sheet([...unmatchedInvestors.entries()].sort((a, b) => b[1] - a[1]).map(([investor, filas]) => ({ investor, filas }))),
  'investors_sin_match'
)
XLSX.writeFile(wbo, OUT)
console.log(`\n→ ${OUT}`)
