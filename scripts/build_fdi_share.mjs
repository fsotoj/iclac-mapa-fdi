#!/usr/bin/env node
// One-off: serie "participación china en el stock FDI total por país" (métrica 2).
// Lee public/data/investments.json (numerador) + data/external/unctad_fdi_stock.csv
// (denominador) y emite docs/sprint_4/analisis_fdi_share.xlsx con serie, resumen y
// flags de coherencia. NO está en build chain; análisis interno, sin UI.
// Numerador SIN Construcción (la metodología la excluye del total FDI).
import XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const INVESTMENTS = resolve(REPO_ROOT, 'public/data/investments.json')
const UNCTAD = resolve(REPO_ROOT, 'data/external/unctad_fdi_stock.csv')
const CDIS = resolve(REPO_ROOT, 'data/external/imf_cdis_china.csv')
const OUTPUT = resolve(REPO_ROOT, 'docs/sprint_4/analisis_fdi_share.xlsx')

const COUNTRY_TO_ISO3 = {
  Argentina: 'ARG', Bolivia: 'BOL', Brazil: 'BRA', Chile: 'CHL', Colombia: 'COL',
  Ecuador: 'ECU', Guyana: 'GUY', Panama: 'PAN', Paraguay: 'PRY', Peru: 'PER',
  Suriname: 'SUR', Uruguay: 'URY', Venezuela: 'VEN'
}

const flags = []
const flag = (severity, scope, msg) => flags.push({ severity, scope, msg })

// ---- Numerador: stock chino acumulado por país-año (dedup, sin Construcción) ----
const investments = JSON.parse(readFileSync(INVESTMENTS, 'utf8'))

// Dedup por id: primera fila define país/año; monto = primer valor no nulo
// (misma regla que aggregateInvestments en src/lib/filter.ts).
const byId = new Map()
for (const inv of investments) {
  if (!byId.has(inv.id)) {
    byId.set(inv.id, { country: inv.country, year: inv.year, amount: inv.investment_musd, is_construction: inv.is_construction })
  } else {
    const e = byId.get(inv.id)
    if (e.amount == null && inv.investment_musd != null) e.amount = inv.investment_musd
  }
}

let sinMonto = 0
let sinAnio = 0
let totalChinoSinConstruccion = 0
const chineseByCountryYear = new Map() // iso3 -> Map(year -> sum)
for (const [id, e] of byId) {
  if (e.is_construction) continue
  if (e.amount == null) { sinMonto++; continue }
  totalChinoSinConstruccion += e.amount
  if (e.year == null) { sinAnio++; flag('warn', id, 'inversión con monto pero sin año — fuera de la serie'); continue }
  const iso3 = COUNTRY_TO_ISO3[e.country]
  if (!iso3) { flag('error', id, `país no mapeado a ISO3: ${e.country}`); continue }
  if (!chineseByCountryYear.has(iso3)) chineseByCountryYear.set(iso3, new Map())
  const m = chineseByCountryYear.get(iso3)
  m.set(e.year, (m.get(e.year) ?? 0) + e.amount)
}

flag('info', 'global', `inversiones únicas: ${byId.size} · sin Construcción y con monto: suma US$${Math.round(totalChinoSinConstruccion).toLocaleString('en-US')} MM · sin monto (excluidas): ${sinMonto} · sin año (excluidas de la serie): ${sinAnio}`)

// ---- Denominador: UNCTAD ----
const unctadRows = readFileSync(UNCTAD, 'utf8').trim().split(/\r?\n/).slice(1).map(l => {
  const [iso3, country, year, stock] = l.split(',')
  return { iso3, country, year: Number(year), stock: Number(stock) }
})
const unctadByCountry = new Map()
for (const r of unctadRows) {
  if (!unctadByCountry.has(r.iso3)) unctadByCountry.set(r.iso3, new Map())
  unctadByCountry.get(r.iso3).set(r.year, r.stock)
}

// Coherencia UNCTAD: años faltantes en rango, ceros/negativos, caídas >20% interanual
for (const [iso3, years] of unctadByCountry) {
  const ys = [...years.keys()].sort((a, b) => a - b)
  const [min, max] = [ys[0], ys[ys.length - 1]]
  for (let y = min; y <= max; y++) {
    if (!years.has(y)) flag('warn', iso3, `UNCTAD sin dato para ${y} (rango ${min}-${max})`)
  }
  for (const y of ys) {
    const v = years.get(y)
    if (v <= 0) flag('warn', iso3, `UNCTAD stock ≤ 0 en ${y}: ${v}`)
    const prev = years.get(y - 1)
    if (prev > 0 && v < prev * 0.8) flag('info', iso3, `UNCTAD cae ${(100 - v / prev * 100).toFixed(0)}% en ${y} (${Math.round(prev)} → ${Math.round(v)}) — posible revalorización/crisis, revisar`)
  }
}

// ---- Serie share(c,t) ----
const LAST_YEAR = Math.max(...unctadRows.map(r => r.year))
const serie = []
const resumen = []
for (const [name, iso3] of Object.entries(COUNTRY_TO_ISO3)) {
  const chinese = chineseByCountryYear.get(iso3) ?? new Map()
  const unctad = unctadByCountry.get(iso3) ?? new Map()
  const firstChineseYear = chinese.size ? Math.min(...chinese.keys()) : null
  if (firstChineseYear === null) { flag('warn', iso3, 'sin inversiones chinas con monto y año en la base'); continue }
  const firstUnctadYear = unctad.size ? Math.min(...unctad.keys()) : null
  if (firstUnctadYear !== null && firstUnctadYear > firstChineseYear) {
    flag('warn', iso3, `UNCTAD parte en ${firstUnctadYear} pero hay inversión china desde ${firstChineseYear} — serie trunca al inicio`)
  }

  let cum = 0
  let lastShareRow = null
  for (let y = firstChineseYear; y <= LAST_YEAR; y++) {
    cum += chinese.get(y) ?? 0
    const stock = unctad.get(y) ?? null
    const share = stock ? (cum / stock) * 100 : null
    const row = {
      iso3,
      country: name,
      year: y,
      chinese_cum_musd: Math.round(cum * 10) / 10,
      unctad_stock_musd: stock !== null ? Math.round(stock * 10) / 10 : null,
      share_pct: share !== null ? Math.round(share * 100) / 100 : null
    }
    serie.push(row)
    if (share !== null) lastShareRow = row
  }
  if (lastShareRow) {
    resumen.push({
      iso3,
      country: name,
      year: lastShareRow.year,
      chinese_cum_musd: lastShareRow.chinese_cum_musd,
      unctad_stock_musd: lastShareRow.unctad_stock_musd,
      share_pct: lastShareRow.share_pct
    })
    if (lastShareRow.share_pct > 25) flag('info', iso3, `share ${lastShareRow.share_pct}% en ${lastShareRow.year} — alto, contrastar contra literatura antes de publicar`)
  } else {
    flag('warn', iso3, 'sin ningún año común entre serie china y UNCTAD — share no computable')
  }
}
resumen.sort((a, b) => b.share_pct - a.share_pct)

// ---- Métrica 2b: brecha vs posición oficial bilateral (FMI CDIS/DIP) ----
// Oficial = lo que el banco central del país reporta como stock "desde China"
// (contraparte inmediata). Subestima por conduits (HK/Caimán/BVI); la brecha
// contra nuestro rastreo deal-level ES el hallazgo, no un error.
// dv_type: SCC (encuesta CDIS estándar, 2018+) preferido; O (vintage anterior) rellena años previos.
const cdisBrecha = []
const cdisResumen = []
const cdisRows = readFileSync(CDIS, 'utf8').trim().split(/\r?\n/).slice(1).map(l => {
  const [iso3, dv_type, year, pos] = l.split(',')
  return { iso3, dv_type, year: Number(year), pos: Number(pos) }
})
const cdisByCountry = new Map() // iso3 -> Map(year -> {pos, dv_type})
for (const r of cdisRows) {
  if (!cdisByCountry.has(r.iso3)) cdisByCountry.set(r.iso3, new Map())
  const m = cdisByCountry.get(r.iso3)
  const existing = m.get(r.year)
  if (!existing || (existing.dv_type !== 'SCC' && r.dv_type === 'SCC')) m.set(r.year, { pos: r.pos, dv_type: r.dv_type })
}
for (const [name, iso3] of Object.entries(COUNTRY_TO_ISO3)) {
  const chinese = chineseByCountryYear.get(iso3) ?? new Map()
  const cdis = cdisByCountry.get(iso3) ?? new Map()
  if (!chinese.size || !cdis.size) { flag('warn', iso3, 'sin datos para comparación CDIS'); continue }
  const firstChineseYear = Math.min(...chinese.keys())
  let cum = 0
  let last = null
  for (let y = firstChineseYear; y <= LAST_YEAR; y++) {
    cum += chinese.get(y) ?? 0
    const official = cdis.get(y)
    if (!official) continue
    const row = {
      iso3,
      country: name,
      year: y,
      iclac_cum_musd: Math.round(cum * 10) / 10,
      cdis_oficial_musd: official.pos,
      dv_type: official.dv_type,
      ratio_iclac_vs_oficial: official.pos > 0 ? Math.round((cum / official.pos) * 10) / 10 : null
    }
    cdisBrecha.push(row)
    last = row
  }
  if (last) {
    cdisResumen.push(last)
    if (last.cdis_oficial_musd > last.iclac_cum_musd) {
      flag('info', iso3, `CDIS oficial (${Math.round(last.cdis_oficial_musd)}) > nuestro acumulado (${Math.round(last.iclac_cum_musd)}) en ${last.year} — inesperado, revisar cobertura nuestra`)
    }
  }
}
cdisResumen.sort((a, b) => (b.ratio_iclac_vs_oficial ?? 0) - (a.ratio_iclac_vs_oficial ?? 0))

// ---- Salida ----
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serie), 'serie')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'resumen_ultimo_anio')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cdisBrecha), 'cdis_brecha')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cdisResumen), 'cdis_resumen')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flags), 'flags')
XLSX.writeFile(wb, OUTPUT)

console.log(`serie: ${serie.length} filas país-año · resumen: ${resumen.length} países · cdis_brecha: ${cdisBrecha.length} · flags: ${flags.length}`)
console.log(`\n=== Métrica 2b: ICLAC vs posición oficial bilateral (CDIS), último año común ===`)
for (const r of cdisResumen) {
  console.log(` ${r.iso3} ${String(r.ratio_iclac_vs_oficial ?? '—').padStart(7)}×  (ICLAC ${Math.round(r.iclac_cum_musd).toLocaleString('en-US')} vs oficial ${Math.round(r.cdis_oficial_musd).toLocaleString('en-US')} MM, ${r.year})`)
}
console.log(`\n=== Resumen último año común (${LAST_YEAR}) ===`)
for (const r of resumen) {
  console.log(` ${r.iso3} ${String(r.share_pct).padStart(6)}%  (chino ${Math.round(r.chinese_cum_musd).toLocaleString('en-US')} / UNCTAD ${Math.round(r.unctad_stock_musd).toLocaleString('en-US')} MM, ${r.year})`)
}
console.log('\n=== Flags ===')
for (const f of flags) console.log(` [${f.severity}] ${f.scope}: ${f.msg}`)
console.log(`\nsalida: ${OUTPUT}`)
