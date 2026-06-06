#!/usr/bin/env node
import XLSX from 'xlsx'
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const INPUT_XLSX = resolve(REPO_ROOT, 'data/source/entrega1_inversiones.xlsx')
const LEGACY_DIR = resolve(REPO_ROOT, 'legacy/data')
const OUTPUT_DIR = resolve(REPO_ROOT, 'data/conflicts')
const OUTPUT_XLSX = resolve(OUTPUT_DIR, 'conflictos_vector_entrega1.xlsx')

const buildLegacyOverlay = () => {
  const byId = new Map()
  if (!existsSync(LEGACY_DIR)) return byId
  const files = readdirSync(LEGACY_DIR).filter(f => f.endsWith('.json') && !f.includes('latam') && !f.includes('sankey') && !f.includes('america'))
  for (const f of files) {
    let data
    try { data = JSON.parse(readFileSync(join(LEGACY_DIR, f), 'utf8')) } catch { continue }
    if (!Array.isArray(data)) continue
    for (const r of data) {
      if (r.Id_Investment === undefined || r.Id_Investment === null) continue
      const key = String(parseInt(String(r.Id_Investment), 10))
      const v = r.Vector
      if (v === 'Punto' || v === 'Vector') {
        if (!byId.has(key)) byId.set(key, { vector: v, sourceFile: f })
      }
    }
  }
  return byId
}

const legacy = buildLegacyOverlay()
console.log(`Legacy overlay: ${legacy.size} ids`)

const wb = XLSX.readFile(INPUT_XLSX)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Total'], { defval: null })
console.log(`XLSX rows: ${rows.length}`)

const conflicts = []
const seenIds = new Set()

for (const r of rows) {
  const idRaw = r.Id_Investment
  if (idRaw === null || idRaw === undefined) continue
  const idKey = String(parseInt(String(idRaw), 10))
  const xlsxVector = r.Vector
  const legacyEntry = legacy.get(idKey)

  let category = null
  let actionTaken = null
  let suggestedFix = null

  if (legacyEntry) {
    if (xlsxVector === legacyEntry.vector) continue
    if (xlsxVector === null || xlsxVector === undefined || xlsxVector === '' || xlsxVector === 0 || xlsxVector === 1) {
      category = 'XLSX vacío/inválido — recuperado de legacy'
      actionTaken = `ETL usó "${legacyEntry.vector}" del legado`
      suggestedFix = `Completar Vector con "${legacyEntry.vector}" en el XLSX`
    } else if ((xlsxVector === 'Punto' || xlsxVector === 'Vector') && xlsxVector !== legacyEntry.vector) {
      category = 'Conflicto directo XLSX vs legacy'
      actionTaken = `ETL usó "${legacyEntry.vector}" (legado tiene prioridad)`
      suggestedFix = `Revisar: XLSX dice "${xlsxVector}", legado dice "${legacyEntry.vector}". Decidir cuál es correcto y corregir XLSX`
    } else {
      continue
    }
  } else {
    if (xlsxVector === null || xlsxVector === undefined || xlsxVector === '' || xlsxVector === 0 || xlsxVector === 1) {
      category = 'XLSX vacío/inválido — sin legacy de referencia'
      actionTaken = 'ETL trató como "Punto" por defecto (conservador)'
      suggestedFix = 'Confirmar si es Punto (ubicación única) o Vector (línea/trayecto)'
    } else if (xlsxVector !== 'Punto' && xlsxVector !== 'Vector') {
      category = `Valor desconocido en Vector: ${JSON.stringify(xlsxVector)}`
      actionTaken = 'ETL trató como "Punto" por defecto'
      suggestedFix = 'Corregir a "Punto" o "Vector" según corresponda'
    } else {
      continue
    }
  }

  conflicts.push({
    Id_Investment: idRaw,
    Categoria: category,
    XLSX_Vector: xlsxVector === null ? '(vacío)' : xlsxVector,
    Legacy_Vector: legacyEntry?.vector ?? '(no existe en legado)',
    Legacy_Source: legacyEntry?.sourceFile ?? '',
    Accion_ETL: actionTaken,
    Sugerencia_Cliente: suggestedFix,
    Country: r.Country ?? '',
    Investor: r.Investor ?? r.investor ?? '',
    Year: r.Year ?? '',
    Area_EN: r.Area_EN ?? '',
    Area_ES: r.Area_ES ?? '',
    Detail_ES: r.Detail_ES ?? '',
    Detail_EN: r.Detail_EN ?? '',
    Coordinates: r.Coordinates ?? '',
    Path: r.Path ?? ''
  })

  if (!seenIds.has(idKey)) seenIds.add(idKey)
}

mkdirSync(OUTPUT_DIR, { recursive: true })

// Agrupar por (id × categoría) para que el desglose de Resumen reconcilie con
// Detalle/META: una misma inversión puede tener filas en distintas categorías.
const grouped = new Map()
for (const c of conflicts) {
  const k = String(parseInt(String(c.Id_Investment), 10)) + '||' + c.Categoria
  if (!grouped.has(k)) grouped.set(k, [])
  grouped.get(k).push(c)
}

const distinctIds = new Set(conflicts.map(c => String(parseInt(String(c.Id_Investment), 10))))

const summaryRows = []
for (const [, items] of grouped) {
  const first = items[0]
  summaryRows.push({
    Id_Investment: first.Id_Investment,
    Filas_Afectadas: items.length,
    Categoria: first.Categoria,
    XLSX_Vector: first.XLSX_Vector,
    Legacy_Vector: first.Legacy_Vector,
    Country: first.Country,
    Investor: first.Investor,
    Year: first.Year,
    Area_EN: first.Area_EN,
    Detail_EN: first.Detail_EN,
    Accion_ETL: first.Accion_ETL,
    Sugerencia_Cliente: first.Sugerencia_Cliente
  })
}
summaryRows.sort((a, b) => a.Categoria.localeCompare(b.Categoria) || String(a.Id_Investment).localeCompare(String(b.Id_Investment)))

const categoryCounts = {}
for (const c of conflicts) categoryCounts[c.Categoria] = (categoryCounts[c.Categoria] || 0) + 1

const metaRows = [
  { Campo: 'Generado', Valor: new Date().toISOString() },
  { Campo: 'Archivo XLSX origen', Valor: 'Copy of Entrega 1 (inversiones por país).xlsx' },
  { Campo: 'Total filas XLSX', Valor: rows.length },
  { Campo: 'Filas con conflicto Vector', Valor: conflicts.length },
  { Campo: 'IDs únicos con conflicto', Valor: distinctIds.size },
  { Campo: '', Valor: '' },
  { Campo: 'Resumen por categoría', Valor: '' },
  ...Object.entries(categoryCounts).map(([k, v]) => ({ Campo: k, Valor: v })),
  { Campo: '', Valor: '' },
  { Campo: 'Cómo leer este archivo', Valor: '' },
  { Campo: '— Hoja Resumen', Valor: '1 fila por inversión y categoría de conflicto (una inversión con categorías mixtas aparece en varias filas). Vista rápida para revisión.' },
  { Campo: '— Hoja Detalle', Valor: 'Todas las filas afectadas con sus coordenadas. Útil para auditar caso por caso.' },
  { Campo: '— Hoja META', Valor: 'Esta hoja: contexto y estadísticas.' },
  { Campo: '', Valor: '' },
  { Campo: 'Reglas aplicadas por el ETL', Valor: '' },
  { Campo: '1. Si Vector existe en legado (Punto o Vector)', Valor: 'Se usa el valor del legado (legado tiene prioridad sobre XLSX)' },
  { Campo: '2. Si Vector falta o es 0/1/vacío y no hay legado', Valor: 'Se trata como "Punto" por defecto (no genera líneas falsas)' },
  { Campo: '3. Si Vector dice "Punto"/"Vector" y no hay legado', Valor: 'Se respeta el valor del XLSX' }
]

const wbOut = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(metaRows), 'META')
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(summaryRows), 'Resumen')
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(conflicts), 'Detalle')

XLSX.writeFile(wbOut, OUTPUT_XLSX)

console.log(`\nConflicts found: ${conflicts.length} rows · ${distinctIds.size} distinct investments · ${grouped.size} id×category groups`)
console.log('By category:')
for (const [k, v] of Object.entries(categoryCounts)) console.log(`  ${k}: ${v}`)
console.log(`\nOutput: ${OUTPUT_XLSX}`)
