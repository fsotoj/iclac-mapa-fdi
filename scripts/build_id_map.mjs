#!/usr/bin/env node
// One-off: tabla de equivalencia Id_Investment legado -> nuevo formato ALPHA3-NNNN.
// Lee la última base del cliente y emite docs/sprint_3/equivalencia_ids.xlsx.
// No está en el build chain; re-correr es seguro (regenera la tabla completa).
import XLSX from 'xlsx'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const INPUT = resolve(REPO_ROOT, 'docs/sprint_3/AUDITADO_COMPLETO_26_06.xlsx')
const OUTPUT = resolve(REPO_ROOT, 'docs/sprint_3/equivalencia_ids.xlsx')

const wb = XLSX.readFile(INPUT)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['TOTAL_AUDITADO'], { defval: null, raw: true })

// Código de país legado embebido como sufijo del Id_Investment (verificado contra la base).
const LEGACY_SUFFIX = {
  Argentina: '160', Bolivia: '145', Brazil: '140', Chile: '155',
  Colombia: '100', Ecuador: '130', Guyana: '110', Panama: '095',
  Paraguay: '150', Peru: '135', Suriname: '115', Uruguay: '165',
  Venezuela: '101'
}

const byId = new Map()
for (const r of rows) {
  const id = String(r.Id_Investment)
  if (!byId.has(id)) {
    byId.set(id, { country: r.Country, alpha3: r.COUNTRY_ISO_ALPHA3, rowCount: 0 })
  }
  byId.get(id).rowCount++
}

const out = []
const anomalies = []
for (const [id, info] of byId) {
  const suffix = LEGACY_SUFFIX[info.country]
  if (!suffix) { anomalies.push({ id, country: info.country, problema: 'país sin código legado conocido' }); continue }
  // El sufijo sobrevive la coerción numérica (solo se pierden ceros del inicio),
  // pero Panamá (095) pierde el 0 del código si la secuencia es corta: normalizar.
  let seqStr = null
  if (id.endsWith(suffix)) {
    seqStr = id.slice(0, -suffix.length)
  } else if (suffix.startsWith('0') && id.endsWith(suffix.slice(1))) {
    // caso "5095" guardado como 5095: el id completo era 0005095 -> seq 0005? No:
    // "18095" termina en "095" OK; un caso corto tipo "595" (=0000595? seq 5 + 95?) es ambiguo.
    anomalies.push({ id, country: info.country, problema: `sufijo ambiguo (esperado ${suffix})` })
    continue
  } else {
    anomalies.push({ id, country: info.country, problema: `no termina en código legado ${suffix}` })
    continue
  }
  const seq = seqStr === '' ? null : Number.parseInt(seqStr, 10)
  if (seq === null || Number.isNaN(seq)) {
    anomalies.push({ id, country: info.country, problema: 'secuencia no numérica' })
    continue
  }
  out.push({
    Id_Investment_actual: id,
    Country: info.country,
    COUNTRY_ISO_ALPHA3: info.alpha3,
    Secuencia: seq,
    Id_Investment_nuevo: `${info.alpha3}-${String(seq).padStart(4, '0')}`,
    Filas_en_base: info.rowCount
  })
}

out.sort((a, b) => a.COUNTRY_ISO_ALPHA3.localeCompare(b.COUNTRY_ISO_ALPHA3) || a.Secuencia - b.Secuencia)

// Chequeo de colisiones en el espacio nuevo
const seen = new Map()
for (const r of out) {
  if (seen.has(r.Id_Investment_nuevo)) {
    anomalies.push({ id: r.Id_Investment_actual, country: r.Country, problema: `colisión nueva con ${seen.get(r.Id_Investment_nuevo)}` })
  } else seen.set(r.Id_Investment_nuevo, r.Id_Investment_actual)
}

const outWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(out), 'equivalencia')
if (anomalies.length) {
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(anomalies), 'anomalias')
}
XLSX.writeFile(outWb, OUTPUT)

console.log(`ids mapeados: ${out.length}`)
console.log(`anomalías: ${anomalies.length}`)
if (anomalies.length) console.log(anomalies.slice(0, 10))
const perCountry = {}
for (const r of out) perCountry[r.COUNTRY_ISO_ALPHA3] = (perCountry[r.COUNTRY_ISO_ALPHA3] || 0) + 1
console.log('por país:', perCountry)
console.log(`salida: ${OUTPUT}`)
