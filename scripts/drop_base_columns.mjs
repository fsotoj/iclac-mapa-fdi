#!/usr/bin/env node
// Saca de la base por país las columnas que tienen una segunda fuente en
// conflicto (schema v1.5, 28-07). Hoy: las dos de propiedad.
//
//   Ownership          → la propiedad es atributo de la EMPRESA, no del deal, y
//                        vive en data/schema/investors_map.csv (schema §5.1).
//                        Tenerla en los dos lados garantizó divergencia: la base
//                        del cliente quedó con 0 `Local SOE` y la nuestra con 21.
//   Ownership_Original → copia pre-rename (SASAC/SOE en 11.909 de 12.532 filas).
//                        Columna de trabajo, que §1 ya prohíbe. Se salva de la
//                        regla `archivo/columna-prohibida` sólo porque el patrón
//                        es /_ORIG$/ y ésta termina en `_Original`.
//
// NO toca `reliability_score` (discusión abierta del umbral), `Id_Investment_Original`
// (llave del join con la base legada) ni `source1-3`.
//
// Emite además un respaldo de lo borrado, para adjuntar al correo: "está en el
// historial de git" no es una vía de recuperación para el cliente.
//
// Uso: node scripts/drop_base_columns.mjs <dirEntrada> <dirSalida>
import XLSX from 'xlsx'
import { readdirSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const DROP = ['Ownership', 'Ownership_Original']
// Columnas que identifican la fila en el respaldo.
const KEYS = ['Id_Investment', 'Id_Seq', 'Country', 'Investor']
const BACKUP = resolve(REPO_ROOT, 'docs/sprint_5/respaldo_columnas_ownership.xlsx')

const inDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null
const outDir = process.argv[3] ? resolve(process.cwd(), process.argv[3]) : null
if (!inDir || !outDir) {
  console.error('Uso: node scripts/drop_base_columns.mjs <dirEntrada> <dirSalida>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const backupRows = []
let filesTouched = 0
let cellsDropped = 0

for (const f of readdirSync(inDir).filter((x) => x.endsWith('.xlsx') && !x.startsWith('~$')).sort()) {
  const wb = XLSX.readFile(resolve(inDir, f))
  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
  if (!rows.length) {
    XLSX.writeFile(wb, join(outDir, f))
    continue
  }

  const present = DROP.filter((c) => c in rows[0])
  if (!present.length) {
    console.log(`  ${f}: sin columnas que sacar`)
    XLSX.writeFile(wb, join(outDir, f))
    continue
  }

  // Respaldo antes de tocar nada.
  for (const r of rows) {
    const keep = {}
    for (const k of KEYS) if (k in r) keep[k] = r[k]
    keep.archivo = f
    for (const c of present) {
      keep[c] = r[c]
      if (r[c] !== null && r[c] !== '') cellsDropped++
    }
    backupRows.push(keep)
  }

  // Reconstruye la hoja sin esas columnas. El orden de claves que devuelve
  // sheet_to_json es el de la fila de encabezado, así que se preserva.
  const cleaned = rows.map((r) => {
    const o = {}
    for (const [k, v] of Object.entries(r)) if (!present.includes(k)) o[k] = v
    return o
  })
  const ws = XLSX.utils.json_to_sheet(cleaned, { header: Object.keys(cleaned[0]) })
  const out = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(out, ws, sheetName)
  XLSX.writeFile(out, join(outDir, f))
  filesTouched++
  console.log(`  ${f}: −[${present.join(', ')}] · ${rows.length} filas`)
}

console.log(`\nArchivos modificados: ${filesTouched} · celdas con valor borradas: ${cellsDropped}`)

if (backupRows.length) {
  const wb = XLSX.utils.book_new()
  const readme = [
    { campo: 'Qué es', valor: 'Respaldo de las columnas de propiedad que se sacaron de la base por país.' },
    { campo: 'Fecha', valor: new Date().toISOString().slice(0, 10) },
    { campo: 'Columnas sacadas', valor: DROP.join(', ') },
    { campo: 'Por qué', valor: 'La propiedad es atributo de la empresa inversora, no de la inversión, y se mantiene en un solo lugar (la tabla de inversores). Tenerla en los dos lados hizo que divergieran.' },
    { campo: 'Filas', valor: backupRows.length }
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readme), 'README')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(backupRows), 'ownership_borrado')
  XLSX.writeFile(wb, BACKUP)
  console.log(`Respaldo → ${BACKUP}`)
}
