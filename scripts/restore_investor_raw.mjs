#!/usr/bin/env node
// Restaura el nombre RAW del inversor en la base por país (opción 1, 24-07).
// La entrega normalizó `Investor` a nombre canónico y `Investor_Original` llegó
// roto (constante por archivo). El id viejo sí quedó bien en `Id_Investment_Original`,
// así que recuperamos el raw joineando contra la base vieja (entrega1) por id
// numérico. Recupera ~96% (446/465); las que no matchean son inversiones nuevas.
//
// Edita los xlsx IN-PLACE (solo las celdas de Investor / Investor_Original) para
// no alterar el resto de columnas ni el formato. Escribe copias corregidas en un
// directorio de salida y lista las inversiones nuevas sin raw recuperable.
//
// Uso: node scripts/restore_investor_raw.mjs <dirEntrada> <dirSalida>
import XLSX from 'xlsx'
import { readdirSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
// Fuentes del raw, en orden de prioridad: la base INMEDIATAMENTE anterior al
// cambio del cliente manda (restaurar = deshacer su canonicalización), y las más
// viejas rellenan huecos. Usar solo entrega1 dejaba fuera inversiones que
// entraron en entregas intermedias (se veían como "nuevas" sin serlo).
const RAW_SOURCES = [
  resolve(REPO_ROOT, 'docs/sprint_3/AUDITADO_COMPLETO_26_06.xlsx'),
  resolve(REPO_ROOT, 'docs/sprint_3/AUDITADO_COMPLETO.xlsx'),
  resolve(REPO_ROOT, 'data/source/entrega1_inversiones.xlsx')
]

const inDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null
const outDir = process.argv[3] ? resolve(process.cwd(), process.argv[3]) : null
if (!inDir || !outDir) {
  console.error('Uso: node scripts/restore_investor_raw.mjs <dirEntrada> <dirSalida>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const numId = (x) => {
  const n = Number.parseInt(String(x ?? '').trim(), 10)
  return Number.isNaN(n) ? null : String(n)
}

// --- Raw por id: primera fuente que lo tenga gana (orden de prioridad arriba) ---
const rawById = new Map()
for (const src of RAW_SOURCES) {
  if (!existsSync(src)) continue
  const wb = XLSX.readFile(src)
  const sheet = wb.Sheets['Total'] ?? wb.Sheets['TOTAL_AUDITADO'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
  let added = 0
  for (const r of rows) {
    const id = numId(r.Id_Investment)
    const inv = r.Investor == null ? '' : String(r.Investor).trim()
    if (id && inv && !rawById.has(id)) { rawById.set(id, inv); added++ }
  }
  console.log(`fuente ${src.split(/[\\/]/).pop()}: +${added} ids con raw`)
}
console.log(`total ids con raw disponible: ${rawById.size}\n`)

// Índice de columnas de la fila de encabezado.
const headerIndex = (ws) => {
  const range = XLSX.utils.decode_range(ws['!ref'])
  const idx = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
    if (cell && cell.v != null) idx[String(cell.v).trim()] = c
  }
  return { idx, range }
}

let totalFixed = 0
const nuevas = []

for (const f of readdirSync(inDir).filter((x) => x.endsWith('.xlsx') && !x.startsWith('~$')).sort()) {
  const wb = XLSX.readFile(resolve(inDir, f))
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const { idx, range } = headerIndex(ws)
  const cInv = idx.Investor
  const cOrig = idx.Investor_Original
  const cIdOrig = idx.Id_Investment_Original
  const cId = idx.Id_Investment
  const cAmt = idx.Investment
  const cCountry = idx.Country
  if (cInv == null || cIdOrig == null) {
    console.log(`  ${f}: sin Investor/Id_Investment_Original — se copia sin cambios`)
    XLSX.writeFile(wb, join(outDir, f))
    continue
  }

  let fixed = 0
  const seen = new Set()
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const oidCell = ws[XLSX.utils.encode_cell({ r, c: cIdOrig })]
    const oid = numId(oidCell ? oidCell.v : null)
    const raw = oid ? rawById.get(oid) : null
    if (raw != null && raw !== '') {
      ws[XLSX.utils.encode_cell({ r, c: cInv })] = { t: 's', v: String(raw) }
      fixed++
    } else {
      // inversión nueva sin raw recuperable — se registra una vez por Id
      const idCell = cId != null ? ws[XLSX.utils.encode_cell({ r, c: cId })] : null
      const id = idCell ? String(idCell.v) : `(fila ${r + 1})`
      if (!seen.has(id)) {
        seen.add(id)
        const invCell = ws[XLSX.utils.encode_cell({ r, c: cInv })]
        const amtCell = cAmt != null ? ws[XLSX.utils.encode_cell({ r, c: cAmt })] : null
        const couCell = cCountry != null ? ws[XLSX.utils.encode_cell({ r, c: cCountry })] : null
        nuevas.push({
          archivo: f,
          Id_Investment: id,
          Country: couCell ? couCell.v : '',
          Investor_actual: invCell ? invCell.v : '',
          Investment: amtCell ? amtCell.v : ''
        })
      }
    }
    // limpiar Investor_Original (roto): dejar la celda vacía
    if (cOrig != null) {
      const addr = XLSX.utils.encode_cell({ r, c: cOrig })
      if (ws[addr]) delete ws[addr]
    }
  }
  totalFixed += fixed
  console.log(`  ${f}: ${fixed} filas con Investor restaurado`)
  XLSX.writeFile(wb, join(outDir, f))
}

console.log(`\nTotal filas con raw restaurado: ${totalFixed}`)
console.log(`Inversiones nuevas sin raw recuperable: ${nuevas.length}`)
for (const n of nuevas) console.log(`  ${n.Id_Investment} (${n.Country}) — "${n.Investor_actual}" · US$${n.Investment} M`)

// Lista de nuevas → xlsx para pedirle la fuente al cliente.
if (nuevas.length) {
  const listPath = resolve(REPO_ROOT, 'docs/sprint_5/inversores_nuevos_sin_raw.xlsx')
  const lwb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(lwb, XLSX.utils.json_to_sheet(nuevas), 'nuevas_sin_raw')
  XLSX.writeFile(lwb, listPath)
  console.log(`\nLista → ${listPath}`)
}
