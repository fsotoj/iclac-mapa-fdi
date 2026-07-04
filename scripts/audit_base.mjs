#!/usr/bin/env node
// One-off: auditoría de datos sistemática — cruce del archivo de revisión RA
// (transformation_loading/Datos-de-descarga(revisado por Max, Allison y Claude).xlsx,
// fuente de verdad para montos por decisión 2026-07-04) contra la base 26/06 del
// cliente, más detector propio de geometría duplicada (patrón Enel/CSG).
// Emite docs/sprint_4/auditoria_base.xlsx (5 hojas). NO está en build chain.
import XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const RA_FILE = resolve(REPO_ROOT, 'transformation_loading/Datos-de-descarga(revisado por Max, Allison y Claude).xlsx')
const BASE_FILE = resolve(REPO_ROOT, 'docs/sprint_3/AUDITADO_COMPLETO_26_06.xlsx')
const INVESTORS_MAP = resolve(REPO_ROOT, 'data/schema/investors_map.csv')
const OUTPUT = resolve(REPO_ROOT, 'docs/sprint_4/auditoria_base.xlsx')

// Excel coerciona ids a número en la base 26/06; el archivo RA conserva ceros a la izquierda.
const normId = id => String(id).trim().replace(/^0+/, '')

// Montos RA: números, 'NA', o con asterisco de nota al pie ('200*').
const parseRaAmount = v => {
  if (v == null) return { value: null, asterisk: false, raw: v }
  const s = String(v).trim()
  const asterisk = s.endsWith('*')
  const n = Number(s.replace(/\*$/, ''))
  return { value: Number.isFinite(n) ? n : null, asterisk, raw: s }
}

const excerpt = (s, n = 300) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

// ---- Carga ----
const raRows = XLSX.utils.sheet_to_json(XLSX.readFile(RA_FILE).Sheets['Total'])
const baseRows = XLSX.utils.sheet_to_json(XLSX.readFile(BASE_FILE).Sheets['TOTAL_AUDITADO'])

const raById = new Map(raRows.map(r => [normId(r.Id_Investment), r]))
const baseById = new Map() // primera fila por id (país/año/inversor/monto son constantes por id)
const baseRowsById = new Map() // todas las filas (geometría)
for (const r of baseRows) {
  const k = normId(r.Id_Investment)
  if (!baseById.has(k)) baseById.set(k, r)
  if (!baseRowsById.has(k)) baseRowsById.set(k, [])
  baseRowsById.get(k).push(r)
}

// investors_map: solo para contexto (UNKNOWN/vehículos = sospechosos de duplicado matriz/vehículo)
const investorNote = new Map()
{
  const lines = readFileSync(INVESTORS_MAP, 'utf8').trim().split(/\r?\n/).slice(1)
  for (const l of lines) {
    // CSV simple con posibles comas entrecomilladas
    const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
    const [investor_raw, , , , , ownership] = cells
    if (ownership === 'UNKNOWN') investorNote.set(investor_raw, 'ownership UNKNOWN en investors_map')
  }
}

// ---- Hoja 1: montos_divergentes (RA = fuente de verdad) ----
const montosDivergentes = []
for (const [id, ra] of raById) {
  const base = baseById.get(id)
  if (!base) continue
  const raAmt = parseRaAmount(ra.Investment)
  const baseAmt = base.Investment_ARREGLADO ?? null
  const differs = raAmt.raw !== undefined && baseAmt != null
    ? (raAmt.value === null || Number(raAmt.value) !== Number(baseAmt))
    : (raAmt.value != null) !== (baseAmt != null)
  if (!differs) continue
  montosDivergentes.push({
    id,
    investor: ra.Investor,
    country: ra.Country,
    year: ra.Year,
    monto_ra: raAmt.raw,
    monto_base_2606: baseAmt,
    factor: raAmt.value && baseAmt ? Math.round((baseAmt / raAmt.value) * 10) / 10 : null,
    score: ra.reliability_score,
    corregido_explicito: /CORREGIDO/i.test(ra.reliability_notes ?? '') ? 'sí' : 'no',
    asterisco_ra: raAmt.asterisk ? 'sí' : 'no',
    nota_ra: excerpt(ra.reliability_notes)
  })
}
montosDivergentes.sort((a, b) => (b.factor ?? 0) - (a.factor ?? 0))

// ---- Hoja 2: flags_ra (CORREGIDO / ALERTA / ADVERTENCIA / comment_RA) ----
const flagsRa = []
for (const r of raRows) {
  const notes = r.reliability_notes ?? ''
  const comment = (r.comment_RA ?? '').trim()
  const cats = []
  if (/CORREGIDO/i.test(notes)) cats.push('CORREGIDO')
  if (/ALERTA/i.test(notes)) cats.push('ALERTA')
  if (/ADVERTENCIA/i.test(notes)) cats.push('ADVERTENCIA')
  if (comment) cats.push('comment_RA')
  if (!cats.length) continue
  flagsRa.push({
    id: normId(r.Id_Investment),
    investor: r.Investor,
    country: r.Country,
    year: r.Year,
    monto_ra: r.Investment ?? null,
    score: r.reliability_score,
    categorias: cats.join(' + '),
    nota_ra: excerpt(r.reliability_notes),
    comment_ra: excerpt(comment)
  })
}
flagsRa.sort((a, b) => a.categorias.localeCompare(b.categorias) || String(a.id).localeCompare(String(b.id)))

// ---- Hoja 3: ids_delta ----
const idsDelta = []
for (const [id, ra] of raById) {
  if (baseById.has(id)) continue
  idsDelta.push({
    delta: 'solo en RA',
    id,
    investor: ra.Investor,
    country: ra.Country,
    year: ra.Year,
    monto: ra.Investment ?? null,
    clasificacion: ra.investment_classification,
    lectura: ra.Year >= 2025 ? 'inversión nueva 2025 — falta en base 26/06' : 'id con formato no estándar — revisar origen'
  })
}
for (const [id, base] of baseById) {
  if (raById.has(id)) continue
  // candidatos de renombre: mismo país+año en RA, inversor parecido
  const candidates = raRows
    .filter(r => r.Country === base.Country && Number(r.Year) === Number(base.Year) && !baseById.has(normId(r.Id_Investment)))
    .map(r => `${normId(r.Id_Investment)} (${r.Investor})`)
  idsDelta.push({
    delta: 'solo en base 26/06',
    id,
    investor: base.Investor,
    country: base.Country,
    year: base.Year,
    monto: base.Investment_ARREGLADO ?? null,
    clasificacion: base.Project_Type_EN ?? '',
    lectura: candidates.length ? `posible renombre — candidatos RA mismo país/año: ${candidates.join('; ')}` : 'sin candidato en RA mismo país/año — ¿descartada por revisión?'
  })
}
idsDelta.sort((a, b) => a.delta.localeCompare(b.delta) || String(a.country).localeCompare(String(b.country)))

// ---- Hoja 4: duplicados_geometria (detector propio; RA no tiene geometría) ----
// Coordenada exacta (string normalizado a 6 decimales) compartida entre ids distintos.
// Un sitio compartido puede ser legítimo (fases del mismo proyecto); el patrón
// anuncio/cierre se delata por muchas coords compartidas + monto igual + años cercanos.
const coordKey = c => {
  const m = String(c).split(',').map(s => Number(s.trim()))
  if (m.length !== 2 || m.some(n => !Number.isFinite(n))) return null
  return m.map(n => n.toFixed(6)).join(',')
}
const coordsByIdSet = new Map() // id -> Set(coordKey)
for (const [id, rows] of baseRowsById) {
  const set = new Set()
  for (const r of rows) {
    const k = coordKey(r.Coordinates)
    if (k) set.add(k)
  }
  coordsByIdSet.set(id, set)
}
const coordToIds = new Map()
for (const [id, set] of coordsByIdSet) {
  for (const k of set) {
    if (!coordToIds.has(k)) coordToIds.set(k, new Set())
    coordToIds.get(k).add(id)
  }
}
const pairShared = new Map() // "idA|idB" -> count
for (const ids of coordToIds.values()) {
  if (ids.size < 2) continue
  const arr = [...ids].sort()
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const key = `${arr[i]}|${arr[j]}`
      pairShared.set(key, (pairShared.get(key) ?? 0) + 1)
    }
  }
}
const duplicadosGeometria = []
for (const [key, shared] of pairShared) {
  if (shared < 2) continue // 1 coord compartida = ruido (sitios colindantes)
  const [a, b] = key.split('|')
  const ra_a = raById.get(a); const ra_b = raById.get(b)
  const base_a = baseById.get(a); const base_b = baseById.get(b)
  const sizeA = coordsByIdSet.get(a).size; const sizeB = coordsByIdSet.get(b).size
  const overlapPct = Math.round((shared / Math.min(sizeA, sizeB)) * 100)
  const amtA = base_a?.Investment_ARREGLADO ?? null
  const amtB = base_b?.Investment_ARREGLADO ?? null
  const yearA = Number(base_a?.Year); const yearB = Number(base_b?.Year)
  const sospecha = []
  if (overlapPct === 100 && sizeA === sizeB) sospecha.push('geometría idéntica')
  if (amtA != null && amtA === amtB) sospecha.push('mismo monto')
  if (Math.abs(yearA - yearB) <= 1 && yearA !== yearB) sospecha.push('años consecutivos')
  if (base_a?.Investor !== base_b?.Investor) sospecha.push('inversores distintos (¿matriz vs vehículo?)')
  const unknownNote = [base_a?.Investor, base_b?.Investor].filter(inv => investorNote.has(inv)).map(inv => `${inv}: ${investorNote.get(inv)}`)
  duplicadosGeometria.push({
    id_a: a,
    id_b: b,
    investor_a: base_a?.Investor,
    investor_b: base_b?.Investor,
    country: base_a?.Country,
    year_a: yearA,
    year_b: yearB,
    monto_a: amtA,
    monto_b: amtB,
    coords_compartidas: shared,
    coords_a: sizeA,
    coords_b: sizeB,
    solape_pct_menor: overlapPct,
    senales: sospecha.join(' + ') || '—',
    investors_map: unknownNote.join('; ') || '',
    nota_ra_a: excerpt(ra_a?.reliability_notes, 150),
    nota_ra_b: excerpt(ra_b?.reliability_notes, 150)
  })
}
duplicadosGeometria.sort((a, b) => b.solape_pct_menor - a.solape_pct_menor || b.coords_compartidas - a.coords_compartidas)

// ---- Hoja 5: outliers_residuales (monto grande + evidencia débil, no cubiertos arriba) ----
const cubiertos = new Set([
  ...montosDivergentes.map(r => r.id),
  ...duplicadosGeometria.flatMap(r => [r.id_a, r.id_b])
])
const outliersResiduales = []
for (const r of raRows) {
  const id = normId(r.Id_Investment)
  if (cubiertos.has(id)) continue
  const amt = parseRaAmount(r.Investment)
  if (amt.value == null || amt.value < 100) continue
  if (Number(r.reliability_score) > 2) continue
  outliersResiduales.push({
    id,
    investor: r.Investor,
    country: r.Country,
    year: r.Year,
    monto_ra: amt.raw,
    score: r.reliability_score,
    clasificacion: r.investment_classification,
    nota_ra: excerpt(r.reliability_notes)
  })
}
outliersResiduales.sort((a, b) => Number(String(b.monto_ra).replace(/\*$/, '')) - Number(String(a.monto_ra).replace(/\*$/, '')))

// ---- Salida ----
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(montosDivergentes), 'montos_divergentes')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flagsRa), 'flags_ra')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(idsDelta), 'ids_delta')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(duplicadosGeometria), 'duplicados_geometria')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outliersResiduales), 'outliers_residuales')
XLSX.writeFile(wb, OUTPUT)

// ---- Consola ----
const scoreDist = {}
for (const r of raRows) scoreDist[r.reliability_score] = (scoreDist[r.reliability_score] ?? 0) + 1
console.log(`RA: ${raRows.length} inversiones · base 26/06: ${baseById.size} ids (${baseRows.length} filas)`)
console.log(`montos_divergentes: ${montosDivergentes.length} · flags_ra: ${flagsRa.length} · ids_delta: ${idsDelta.length} · duplicados_geometria (≥2 coords): ${duplicadosGeometria.length} · outliers_residuales: ${outliersResiduales.length}`)
console.log(`score ≤2 (mención breve, sin anexo): ${raRows.filter(r => Number(r.reliability_score) <= 2).length} — dist ${JSON.stringify(scoreDist)}`)
console.log('\n=== Montos divergentes (RA = fuente de verdad) ===')
for (const r of montosDivergentes) {
  console.log(` ${r.id.padStart(7)} ${String(r.country).padEnd(10)} ${String(r.investor).slice(0, 38).padEnd(40)} RA ${String(r.monto_ra).padStart(8)} vs base ${String(r.monto_base_2606).padStart(8)}  ×${r.factor ?? '—'}  [corr:${r.corregido_explicito}]`)
}
console.log('\n=== Duplicados geometría (solape ≥50% o geometría idéntica) ===')
for (const r of duplicadosGeometria.filter(r => r.solape_pct_menor >= 50)) {
  console.log(` ${r.id_a} + ${r.id_b} ${String(r.country).padEnd(10)} ${r.coords_compartidas}/${Math.min(r.coords_a, r.coords_b)} coords (${r.solape_pct_menor}%)  ${r.senales}`)
  console.log(`   ${r.investor_a} (${r.year_a}, ${r.monto_a}) vs ${r.investor_b} (${r.year_b}, ${r.monto_b})`)
}
console.log(`\nsalida: ${OUTPUT}`)
