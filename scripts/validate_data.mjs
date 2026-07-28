#!/usr/bin/env node
// Validador de archivos de datos XLSX — CLI para GitHub Actions y uso local.
// Spec: data/schema/schema.md §7. Núcleo puro en scripts/lib/validate.mjs.
//
// Uso:
//   node scripts/validate_data.mjs                      # data/source/*.xlsx (flujo por país)
//   node scripts/validate_data.mjs archivo.xlsx [...]   # archivos específicos (ej. bases agregadas)
//   --strict-ids           formato ALPHA3-NNNN como error (tras confirmación cliente)
//   VALIDATE_THRESHOLD=95  % mínimo de filas válidas (default 95, propuesto — por confirmar)
//
// Exit 1 si algún archivo falla (error de archivo o % válido < umbral).
import XLSX from 'xlsx'
import { appendFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { basename, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRows } from './lib/validate.mjs'
import { loadRegistry, loadCountryBorders, loadInvestorMap, loadCountryBounds } from './lib/load_registry.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const SOURCE_DIR = resolve(REPO_ROOT, 'data/source')

// Bases pre-esquema que no se validan contra el contrato v1.2 (las procesa el
// ETL con sus propias curaciones). El flujo por país NO debe crecer esta lista.
const LEGACY_FILES = new Set(['entrega1_inversiones.xlsx'])

const args = process.argv.slice(2)
const strictIds = args.includes('--strict-ids')
const fileArgs = args.filter((a) => !a.startsWith('--'))
const threshold = Number(process.env.VALIDATE_THRESHOLD ?? 95)

const xlsxIn = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$') && !LEGACY_FILES.has(f))
    .map((f) => resolve(dir, f))

// Cada argumento puede ser un archivo o un DIRECTORIO (se expande a sus *.xlsx).
// Así el mismo comando sirve para el flujo por país del repo cliente
// (data/sources/countries) y para archivos sueltos.
let files = []
for (const a of fileArgs) {
  const p = resolve(process.cwd(), a)
  if (existsSync(p) && statSync(p).isDirectory()) files.push(...xlsxIn(p))
  else files.push(p)
}
if (files.length === 0 && existsSync(SOURCE_DIR)) files = xlsxIn(SOURCE_DIR)

if (files.length === 0) {
  console.log('validate_data: no hay archivos por país que validar en data/source/ (solo base legada). OK.')
  process.exit(0)
}

const MAX_PER_RULE = 15
const summaryRows = []
let anyFailed = false

// Registro de países (país como dato) + bordes disponibles para el chequeo de geometría.
const registry = loadRegistry()
const countryBorders = registry ? loadCountryBorders(registry) : null
const countryBounds = registry ? loadCountryBounds(registry) : null
const investorMap = loadInvestorMap()

// Compuerta de publicación (columna `publish` de countries.csv), separada de la
// validación: un archivo puede estar impecable y aun así no publicarse todavía.
// Se informa para que quien sube el archivo no lo lea como un fallo suyo.
const isPublished = (fileName) => {
  const stem = fileName.replace(/\.xlsx$/i, '').toUpperCase()
  const byA3 = registry?.filenameByAlpha3 ?? {}
  const a3 = Object.keys(byA3).find((k) => byA3[k] === stem)
  return a3 ? registry.publishByAlpha3?.[a3] !== false : true
}
if (registry) console.log(`Registro de países: ${registry.list.length} · bordes disponibles: ${countryBorders ? countryBorders.size : 'n/d'}`)

for (const file of files) {
  const name = basename(file)
  console.log(`\n═══ ${name} ═══`)
  let wb
  try {
    wb = XLSX.readFile(file)
  } catch (err) {
    console.error(`✗ No se pudo leer el archivo: ${err.message}`)
    anyFailed = true
    summaryRows.push({ name, rows: '—', validPct: '—', errors: 1, warnings: 0, passed: false })
    continue
  }
  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
  const { fileErrors, issues, stats } = validateRows(rows, {
    filename: name,
    strictIds,
    threshold,
    sheetCount: wb.SheetNames.length,
    registry,
    countryBorders,
    countryBounds,
    investorMap
  })

  // -- errores de archivo --
  for (const fe of fileErrors) console.log(`  ✗ [${fe.rule}] ${fe.message}`)

  // -- issues agrupados por regla, errores primero --
  const byRule = new Map()
  for (const it of issues) {
    if (!byRule.has(it.rule)) byRule.set(it.rule, [])
    byRule.get(it.rule).push(it)
  }
  const ruleOrder = [...byRule.entries()].sort((a, b) => {
    const sev = (xs) => (xs.some((x) => x.severity === 'error') ? 0 : xs.some((x) => x.severity === 'warning') ? 1 : 2)
    return sev(a[1]) - sev(b[1]) || b[1].length - a[1].length
  })
  for (const [rule, items] of ruleOrder) {
    const icon = items[0].severity === 'error' ? '✗' : items[0].severity === 'warning' ? '⚠' : 'ℹ'
    console.log(`  ${icon} [${rule}] ${items.length} caso(s):`)
    for (const it of items.slice(0, MAX_PER_RULE)) {
      const loc = it.row > 0 ? `fila ${it.row}` : 'archivo'
      console.log(`      ${loc}: ${it.message}`)
    }
    if (items.length > MAX_PER_RULE) console.log(`      … y ${items.length - MAX_PER_RULE} caso(s) más de esta regla.`)
  }

  const published = isPublished(name)
  const veredicto = stats.passed ? (published ? 'PASA ✔' : 'PASA ✔ · RETENIDO, no se publica') : 'FALLA ✗'
  console.log(
    `  ── ${stats.rows} filas · ${stats.validPct}% válidas (umbral ${stats.threshold}%) · ${stats.errors} errores · ${stats.warnings} advertencias → ${veredicto}`
  )
  if (stats.passed && !published) {
    console.log('      El archivo cumple el esquema; no se publica porque countries.csv lo tiene con publish=no.')
  }
  if (!stats.passed) anyFailed = true
  summaryRows.push({ name, rows: stats.rows, validPct: stats.validPct, errors: stats.errors, warnings: stats.warnings, passed: stats.passed, published })
}

// -- resumen para GitHub Actions --
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '## Validación de datos',
    '',
    '| Archivo | Filas | % válidas | Errores | Advertencias | Resultado |',
    '|---|---|---|---|---|---|',
    ...summaryRows.map((r) => `| ${r.name} | ${r.rows} | ${r.validPct} | ${r.errors} | ${r.warnings} | ${r.passed ? (r.published ? '✅ pasa' : '⏸️ pasa, retenido') : '❌ falla'} |`),
    '',
    anyFailed ? 'Revisar el log del paso para el detalle por fila (valor recibido y esperado).' : 'Todos los archivos cumplen el esquema.'
  ].join('\n')
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
}

process.exit(anyFailed ? 1 : 0)
