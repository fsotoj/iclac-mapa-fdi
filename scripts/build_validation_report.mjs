#!/usr/bin/env node
// Genera un informe HTML legible (no-programador) de la validación de los xlsx
// por país. Público: cliente (quien sube y verifica los datos). Autocontenido.
//
// Uso:
//   node scripts/build_validation_report.mjs <dir|archivos...> [--out ruta.html] [--fragment]
//   --fragment  emite solo el contenido de <body> (para publicar como Artifact)
//
// Slice 0 del plan: corre el validador TAL CUAL (sin la capa de normalización
// todavía) para mostrar el estado crudo agrupado. El texto de encabezado explica
// que las causas dominantes son de formato (representación), no de contenido.
import XLSX from 'xlsx'
import { existsSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { basename, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRows, SECTOR_PAIRS } from './lib/validate.mjs'
import { loadRegistry, loadCountryBorders } from './lib/load_registry.mjs'

// ES canónico → concepto EN, más variantes no canónicas pero conceptualmente
// claras. Sirve para detectar cuando Area_ES apunta a un sector DISTINTO del de
// Area_EN (conflicto conceptual, no de formato). Ver next_steps §0.b C9.
const ES_TO_EN = {}
for (const [en, es] of Object.entries(SECTOR_PAIRS)) ES_TO_EN[es.toLowerCase()] = en
Object.assign(ES_TO_EN, {
  agroindustria: 'Agroindustry',
  tic: 'ICT',
  manufacturas: 'Manufacturing',
  manufactura: 'Manufacturing'
})
const conceptOf = (es) => {
  const k = String(es ?? '').trim().toLowerCase()
  if (!k) return null
  if (ES_TO_EN[k]) return ES_TO_EN[k]
  for (const [esk, en] of Object.entries(ES_TO_EN)) if (k.startsWith(esk)) return en
  return null
}

const __dirname = dirname(fileURLToPath(import.meta.url))

const rawArgs = process.argv.slice(2)
let outPath = null
let fragment = false
const inputs = []
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]
  if (a === '--out') outPath = rawArgs[++i]
  else if (a === '--fragment') fragment = true
  else inputs.push(a)
}

// Resolver lista de archivos xlsx.
let files = []
for (const inp of inputs) {
  const p = resolve(process.cwd(), inp)
  if (existsSync(p) && statSync(p).isDirectory()) {
    files.push(
      ...readdirSync(p)
        .filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'))
        .map((f) => resolve(p, f))
    )
  } else {
    files.push(p)
  }
}
if (files.length === 0) {
  console.error('No hay archivos xlsx que validar.')
  process.exit(1)
}

const MAX_EXAMPLES = 4
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const registry = loadRegistry()
const countryBorders = registry ? loadCountryBorders(registry) : null

const results = []
for (const file of files) {
  const name = basename(file)
  let wb
  try {
    wb = XLSX.readFile(file)
  } catch (err) {
    results.push({ name, error: err.message })
    continue
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  const { fileErrors, issues, stats, curaciones } = validateRows(rows, {
    filename: name,
    threshold: 95,
    sheetCount: wb.SheetNames.length,
    registry,
    countryBorders
  })
  results.push({ name, fileErrors, issues, stats, curaciones: curaciones ?? [], rows })
}

// Conflictos conceptuales Area_EN vs Area_ES (por inversión única), sobre la base cruda.
const sectorConflicts = []
for (const r of results) {
  if (!r.rows) continue
  const seen = new Set()
  for (const row of r.rows) {
    const en = String(row.Area_EN ?? '').trim()
    const es = String(row.Area_ES ?? '').trim()
    if (!en || !es) continue
    const concept = conceptOf(es)
    if (concept && concept !== en) {
      const key = `${row.Id_Investment}|${en}|${es}`
      if (seen.has(key)) continue
      seen.add(key)
      sectorConflicts.push({
        file: r.name,
        id: String(row.Id_Investment ?? ''),
        en,
        es,
        concept,
        investor: String(row.Investor ?? '').trim(),
        // "grave" = país que ya está en la base (Area_EN es sector real, no el placeholder Construction)
        grave: en !== 'Construction'
      })
    }
  }
}

// Diccionario de reglas → explicación en lenguaje llano + cómo se arregla.
const RULE_HELP = {
  'fila/iso-num': {
    titulo: 'COUNTRY_ISO_NUM con formato inválido',
    causa: 'La celda trae un apóstrofe pegado al número (\'152 en vez de 152).',
    fix: 'Formatear la columna como Texto y quitar el apóstrofe. Es un solo arreglo, corrige todas las filas.',
    tipo: 'formato'
  },
  'fila/pais-desconocido': {
    titulo: 'Country en mayúsculas',
    causa: 'El país viene como CHILE en vez de Chile, y no matchea la lista.',
    fix: 'Usar la forma con mayúscula inicial (Chile, Argentina, Peru).',
    tipo: 'formato'
  },
  'fila/sector-es': {
    titulo: 'Area_ES no pareada con Area_EN',
    causa: 'La etiqueta en español no coincide 1:1 con nuestra tabla (ej: Agroindustria vs Agronegocios, Tic vs TIC).',
    fix: 'Esta columna la vamos a dejar de exigir (el mapa traduce desde Area_EN). No requiere acción de tu lado.',
    tipo: 'a-resolver-nuestro-lado'
  },
  'fila/sector-en': {
    titulo: 'Area_EN no es un sector canónico',
    causa: 'Valor fuera de los 8 sectores (ej: Construction, que no es una categoría de sector).',
    fix: 'Reclasificar a uno de los 8 sectores (Construction suele ser Infrastructure). Requiere criterio.',
    tipo: 'contenido'
  },
  'fila/ownership': {
    titulo: 'Ownership fuera del enum',
    causa: 'Valor de propiedad que no está en las categorías canónicas (típico: SOE en vez de Local SOE, o SASAC en vez de Central SOE).',
    fix: 'No requiere acción de tu lado: la propiedad se resuelve en la tabla de inversores, no en esta base. Aviso informativo.',
    tipo: 'a-resolver-nuestro-lado'
  },
  'fila/project-type': {
    titulo: 'Project_Type inválido',
    causa: 'Valor en inglés o fuera del enum (Construction, Investment, Joint venture).',
    fix: 'Usar exactamente Adquisición, Greenfield o Construcción (español, con tilde).',
    tipo: 'contenido'
  },
  'fila/requerido-vacio': {
    titulo: 'Columna obligatoria vacía',
    causa: 'Falta un valor requerido por el esquema.',
    fix: 'Completar el dato en origen.',
    tipo: 'contenido'
  },
  'fila/coordenadas-sospechosas': {
    titulo: 'Coordenadas fuera del rango LATAM',
    causa: 'lat/lng posiblemente invertidas.',
    fix: 'Revisar orden: latitud primero, longitud después.',
    tipo: 'contenido'
  },
  'fila/caso-url': {
    titulo: 'URL en CasoN',
    causa: 'El título del estudio trae la URL adentro.',
    fix: 'El título va en CasoN; la URL en LinkN.',
    tipo: 'contenido'
  },
  'fila/cita-invisible': {
    titulo: 'Fuente sin marca Research/News',
    causa: 'Hay CasoN/LinkN pero ni Research ni News en Yes → la fuente no se muestra.',
    fix: 'Marcar Research=Yes o News=Yes en esas filas.',
    tipo: 'contenido'
  },
  'fila/monto-inconsistente': {
    titulo: 'Monto distinto entre filas de la misma inversión',
    causa: 'El Investment cambia entre filas del mismo Id.',
    fix: 'Repetir el mismo monto en todas las filas de la inversión.',
    tipo: 'contenido'
  },
  'fila/metadata-inconsistente': {
    titulo: 'Metadata distinta entre filas de la misma inversión',
    causa: 'Year u otro campo cambia entre filas del mismo Id.',
    fix: 'Mantener idénticos los campos no geográficos dentro de una inversión.',
    tipo: 'contenido'
  },
  'archivo/geometria-compartida': {
    titulo: 'Dos inversiones comparten geometría',
    causa: 'Coordenadas idénticas entre Ids distintos (posible duplicado anuncio/cierre).',
    fix: 'Revisar si son la misma operación o etapas legítimas.',
    tipo: 'revisar'
  },
  'archivo/nombre': {
    titulo: 'Archivo de un país fuera de la lista del proyecto',
    causa: 'El nombre del archivo no corresponde a ningún país del proyecto. No es un tema de mayúsculas/minúsculas (eso el validador ya lo tolera): es un país que todavía no está en el alcance.',
    fix: 'Si este país debe entrar al repositorio, hay que incorporarlo (avisarnos para sumarlo a la lista) y el archivo debe cumplir el contrato de columnas. Mientras tanto, sus filas no se procesan.',
    tipo: 'revisar'
  },
  'archivo/sin-borde': {
    titulo: 'País sin geometría de borde',
    causa: 'El país está reconocido pero todavía no tiene su polígono de borde: aunque los puntos existan, el país no se dibuja en el mapa.',
    fix: 'Nosotros cargamos el borde (semilla de la región). Aviso, no bloquea: el país entra al mapa cuando su borde está y sus datos pasan.',
    tipo: 'a-resolver-nuestro-lado'
  }
}

const tipoBadge = {
  formato: { label: 'Formato', cls: 'b-formato' },
  contenido: { label: 'Contenido', cls: 'b-contenido' },
  revisar: { label: 'Revisar', cls: 'b-revisar' },
  'a-resolver-nuestro-lado': { label: 'Lo resolvemos nosotros', cls: 'b-nuestro' }
}

// Agrupar issues por regla dentro de cada archivo.
const groupByRule = (issues) => {
  const m = new Map()
  for (const it of issues) {
    if (!m.has(it.rule)) m.set(it.rule, [])
    m.get(it.rule).push(it)
  }
  return [...m.entries()].sort((a, b) => {
    const sev = (xs) => (xs.some((x) => x.severity === 'error') ? 0 : xs.some((x) => x.severity === 'warning') ? 1 : 2)
    return sev(a[1]) - sev(b[1]) || b[1].length - a[1].length
  })
}

// Totales globales por regla (para el resumen de arriba).
const globalRule = new Map()
for (const r of results) {
  if (r.error) continue
  // Reglas de fila + de archivo, contando casos y archivos distintos donde ocurren.
  const seenInFile = new Set()
  const bump = (rule, sev) => {
    if (!globalRule.has(rule)) globalRule.set(rule, { count: 0, files: new Set(), sev })
    const e = globalRule.get(rule)
    e.count += 1
    e.files.add(r.name)
  }
  for (const it of r.issues) bump(it.rule, it.severity)
  for (const fe of r.fileErrors) bump(fe.rule, 'error')
}
const globalSorted = [...globalRule.entries()].sort((a, b) => b[1].count - a[1].count)

// Países en incorporación: país RECONOCIDO (en el registro) cuyo archivo aún no
// pasa. Se muestra un checklist de dos compuertas (geometría + datos) en vez de
// un muro de errores. Excluye países fuera de la lista (esos van como error de
// archivo, no como incorporación).
const alpha3OfFile = (name) => {
  if (!registry) return null
  const stem = basename(name, '.xlsx').toUpperCase()
  return Object.keys(registry.filenameByAlpha3).find((a3) => registry.filenameByAlpha3[a3] === stem) ?? null
}
const onboarding = results
  .filter((r) => !r.error && !r.stats.passed && !r.fileErrors.some((f) => f.rule === 'archivo/nombre'))
  .map((r) => {
    const a3 = alpha3OfFile(r.name)
    const hasBorder = !!(a3 && countryBorders && countryBorders.has(a3))
    const blockingRules = new Set(r.issues.filter((x) => x.severity === 'error').map((x) => x.rule))
    const blocking = blockingRules.size + r.fileErrors.filter((f) => f.rule !== 'archivo/sin-borde').length
    const tipos = [...blockingRules].map((rule) => (RULE_HELP[rule] || {}).titulo || rule)
    return { name: r.name, hasBorder, blocking, tipos }
  })

const totalFiles = results.length
const failed = results.filter((r) => r.error || !r.stats.passed).length
const passedCount = totalFiles - failed
const totalRows = results.reduce((s, r) => s + (r.stats?.rows ?? 0), 0)
const totalCuraciones = results.reduce((s, r) => s + (r.stats?.curaciones ?? 0), 0)

const now = new Date().toISOString().slice(0, 16).replace('T', ' ')

// ---- Render ----
// Bloqueante = severidad error (cuenta contra el % válido y puede botar el
// archivo). Warning/info nunca botan. Los problemas de archivo se tratan aparte
// (siempre bloquean).
const blockPill = (sev) =>
  sev === 'error'
    ? '<span class="pill block" title="Cuenta contra el % de filas válidas; si el archivo baja del umbral, se rechaza">Bloqueante</span>'
    : sev === 'warn'
      ? '<span class="pill warn" title="No bota el archivo; es un aviso a revisar">Aviso</span>'
      : '<span class="pill info" title="Informativo, no afecta el resultado">Informativo</span>'

const ruleCard = (rule, items) => {
  const help = RULE_HELP[rule] || { titulo: rule, causa: '', fix: '', tipo: 'contenido' }
  const badge = tipoBadge[help.tipo] || tipoBadge.contenido
  const sev = items.some((x) => x.severity === 'error') ? 'error' : items.some((x) => x.severity === 'warning') ? 'warn' : 'info'
  const examples = items
    .slice(0, MAX_EXAMPLES)
    .map((it) => {
      const loc = it.row > 0 ? `fila ${it.row}` : 'archivo'
      return `<li><span class="loc">${loc}</span> ${esc(it.message)}</li>`
    })
    .join('')
  const more = items.length > MAX_EXAMPLES ? `<li class="more">… y ${items.length - MAX_EXAMPLES} caso(s) más.</li>` : ''
  return `
    <div class="rule ${sev}">
      <div class="rule-head">
        ${blockPill(sev)}
        <span class="rule-title">${esc(help.titulo)}</span>
        <span class="badge ${badge.cls}">${badge.label}</span>
        <span class="count">${items.length} caso(s)</span>
      </div>
      ${help.causa ? `<p class="why"><strong>Qué es:</strong> ${esc(help.causa)}</p>` : ''}
      ${help.fix ? `<p class="fix"><strong>Cómo se corrige:</strong> ${esc(help.fix)}</p>` : ''}
      <details><summary>Ver ejemplos</summary><ul class="ex">${examples}${more}</ul></details>
    </div>`
}

// Conteo por tipo (Formato / Contenido / …) sobre reglas de fila + de archivo.
const TIPO_ORDER = ['contenido', 'formato', 'revisar', 'a-resolver-nuestro-lado']
const fileTipoCounts = (r) => {
  const rules = new Map() // rule -> nº de casos
  for (const it of r.issues) rules.set(it.rule, (rules.get(it.rule) ?? 0) + 1)
  for (const fe of r.fileErrors) rules.set(fe.rule, (rules.get(fe.rule) ?? 0) + 1)
  const byTipo = new Map() // tipo -> { tipos:Set<rule>, casos:n }
  for (const [rule, casos] of rules) {
    const tipo = (RULE_HELP[rule] || {}).tipo || 'contenido'
    if (!byTipo.has(tipo)) byTipo.set(tipo, { tipos: 0, casos: 0 })
    const e = byTipo.get(tipo)
    e.tipos += 1
    e.casos += casos
  }
  return byTipo
}

const fileSection = (r) => {
  if (r.error) {
    return `<details class="file bad"><summary><span class="fname">${esc(r.name)}</span><span class="status bad">no se pudo leer</span></summary><p class="err">${esc(r.error)}</p></details>`
  }
  const s = r.stats
  const statusCls = s.passed ? 'ok' : 'bad'
  const statusTxt = s.passed ? 'PASA' : 'FALLA'
  // Motivo del rechazo, en la mecánica del validador.
  const blockReason = s.passed
    ? s.warnings > 0
      ? 'Aceptado — solo avisos, no bloquean el pipeline.'
      : 'Aceptado.'
    : r.fileErrors.length > 0
      ? `Rechazado — ${r.fileErrors.length} problema(s) de archivo (basta uno para botar el archivo del pipeline).`
      : `Rechazado — ${(100 - s.validPct).toFixed(1)}% de las filas tienen un error bloqueante y supera el margen (umbral ${s.threshold}% válidas).`
  // Tipos de observación bloqueantes (reglas error) + problemas de archivo.
  const blockingRules = new Set(r.issues.filter((x) => x.severity === 'error').map((x) => x.rule))
  const blockingCount = blockingRules.size + r.fileErrors.length
  const byTipo = fileTipoCounts(r)
  const totalTipos = [...byTipo.values()].reduce((n, e) => n + e.tipos, 0)
  const chips = TIPO_ORDER.filter((t) => byTipo.has(t))
    .map((t) => {
      const badge = tipoBadge[t] || tipoBadge.contenido
      const e = byTipo.get(t)
      return `<span class="chip ${badge.cls}" title="${e.casos} caso(s)">${badge.label}: ${e.tipos}</span>`
    })
    .join('')
  const feHtml = r.fileErrors
    .map((fe) => {
      const help = RULE_HELP[fe.rule]
      const fix = help ? `<span class="fix-inline"> — ${esc(help.fix)}</span>` : ''
      return `<li>${esc(fe.message)}${fix}</li>`
    })
    .join('')
  const rulesHtml = groupByRule(r.issues)
    .map(([rule, items]) => ruleCard(rule, items))
    .join('')
  return `
    <details class="file ${statusCls}">
      <summary>
        <span class="fname">${esc(r.name)}</span>
        <span class="status ${statusCls}">${statusTxt}</span>
        ${blockingCount > 0 ? `<span class="pill block">${blockingCount} bloqueante(s)</span>` : ''}
        <span class="tipos">${totalTipos} tipo(s)</span>
        <span class="chips">${chips}</span>
      </summary>
      <p class="meta">${s.rows} filas · ${s.validPct}% válidas (umbral ${s.threshold}%) · ${s.errors} errores · ${s.warnings} advertencias</p>
      <p class="reason ${s.passed ? 'ok' : 'bad'}">${esc(blockReason)}</p>
      ${
        r.curaciones && r.curaciones.length
          ? `<div class="curaciones"><strong>Curación aplicada de nuestro lado (automática, sin pérdida):</strong><ul>${r.curaciones
              .map((c) => `<li>${esc(c.message)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
      ${feHtml ? `<div class="file-errors"><strong>${blockPill('error')} Problemas de archivo</strong> — cualquiera de estos, por sí solo, bota el archivo:<ul>${feHtml}</ul></div>` : ''}
      ${rulesHtml || '<p class="clean">Sin observaciones por fila.</p>'}
    </details>`
}

const sevRank = { error: 0, warning: 1, info: 2 }
const globalSortedBySev = [...globalRule.entries()].sort(
  (a, b) => (sevRank[a[1].sev] ?? 3) - (sevRank[b[1].sev] ?? 3) || b[1].count - a[1].count
)
const globalRows = globalSortedBySev
  .map(([rule, info]) => {
    const help = RULE_HELP[rule] || { titulo: rule, tipo: 'contenido' }
    const badge = tipoBadge[help.tipo] || tipoBadge.contenido
    const block =
      info.sev === 'error'
        ? '<span class="pill block">Bloqueante</span>'
        : info.sev === 'warning'
          ? '<span class="pill warn">Aviso</span>'
          : '<span class="pill info">Informativo</span>'
    return `<tr><td>${block}</td><td>${esc(help.titulo)}</td><td><span class="badge ${badge.cls}">${badge.label}</span></td><td class="num">${info.files.size}</td><td class="num">${info.count.toLocaleString('es')}</td></tr>`
  })
  .join('')

const style = `
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#666; --card:#f7f7f8; --border:#e2e2e5;
    --ok:#0a7d34; --bad:#c62828; --warn:#b26a00; --accent:#0b4f6c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#15171a; --fg:#e6e6e8; --muted:#9a9aa2;
    --card:#1e2126; --border:#2c2f36; --ok:#4ade80; --bad:#f87171; --warn:#fbbf24; --accent:#38bdf8; } }
  :root[data-theme="dark"] { --bg:#15171a; --fg:#e6e6e8; --muted:#9a9aa2; --card:#1e2126;
    --border:#2c2f36; --ok:#4ade80; --bad:#f87171; --warn:#fbbf24; --accent:#38bdf8; }
  :root[data-theme="light"] { --bg:#fff; --fg:#1a1a1a; --muted:#666; --card:#f7f7f8;
    --border:#e2e2e5; --ok:#0a7d34; --bad:#c62828; --warn:#b26a00; --accent:#0b4f6c; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:920px; margin:0 auto; padding:32px 20px 80px; }
  h1 { font-size:26px; margin:0 0 4px; }
  h2 { font-size:19px; margin:36px 0 12px; padding-bottom:6px; border-bottom:1px solid var(--border); }
  h3 { font-size:17px; margin:0 0 6px; display:flex; align-items:center; gap:10px; }
  .sub { color:var(--muted); margin:0 0 24px; }
  .cards { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0 8px; }
  .stat { background:var(--card); border:1px solid var(--border); border-radius:10px;
    padding:14px 18px; min-width:120px; }
  .stat .n { font-size:26px; font-weight:700; }
  .stat .l { color:var(--muted); font-size:13px; }
  .stat.ok { border-left:3px solid var(--ok); }
  .stat.ok .n { color:var(--ok); }
  .stat.bad { border-left:3px solid var(--bad); }
  .stat.bad .n { color:var(--bad); }
  .curaciones { background:color-mix(in srgb,var(--ok) 8%,transparent); border-radius:8px;
    padding:8px 14px; margin:10px 0; font-size:13.5px; }
  .curaciones ul { margin:6px 0 0; padding-left:18px; color:var(--muted); }
  .callout { background:var(--card); border-left:4px solid var(--accent); border-radius:6px;
    padding:14px 18px; margin:18px 0; }
  .pending { background:color-mix(in srgb,var(--warn) 9%,transparent); border:1px solid var(--border);
    border-left:4px solid var(--warn); border-radius:8px; padding:6px 20px 16px; margin:20px 0; }
  .pending tr.grave td { background:color-mix(in srgb,var(--bad) 12%,transparent); font-weight:600; }
  .pending .note { color:var(--muted); font-size:13px; margin:8px 0 0; }
  .onboarding { background:color-mix(in srgb,var(--accent) 7%,transparent); border:1px solid var(--border);
    border-left:4px solid var(--accent); border-radius:8px; padding:6px 20px 16px; margin:20px 0; }
  .onb-card { background:var(--bg); border:1px solid var(--border); border-radius:8px;
    padding:12px 16px; margin:10px 0; }
  .onb-name { font-weight:700; font-size:15px; margin-bottom:6px; }
  .onb-gate { font-size:14px; margin:3px 0; }
  .onb-gate .box { font-family:monospace; font-weight:700; margin-right:6px; }
  .onb-gate .muted { color:var(--muted); }
  code { background:var(--card); border:1px solid var(--border); border-radius:4px;
    padding:1px 5px; font-size:.9em; }
  table { border-collapse:collapse; width:100%; margin:10px 0; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); }
  td.num,th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .overflow { overflow-x:auto; }
  .file { border:1px solid var(--border); border-radius:12px; margin:10px 0; overflow:hidden; }
  .file.ok { border-left:4px solid var(--ok); }
  .file.bad { border-left:4px solid var(--bad); }
  .file > summary { list-style:none; cursor:pointer; padding:14px 18px;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .file > summary::-webkit-details-marker { display:none; }
  .file > summary::before { content:"▸"; color:var(--muted); font-size:12px; transition:transform .15s; }
  .file[open] > summary::before { transform:rotate(90deg); }
  .file > summary:hover { background:var(--card); }
  .file > summary .fname { font-weight:700; font-size:16px; }
  .file > summary .tipos { color:var(--muted); font-size:13px; }
  .file > summary .chips { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; }
  .chip { font-size:11px; font-weight:600; padding:2px 9px; border-radius:999px; border:1px solid var(--border); white-space:nowrap; }
  .file > .meta, .file > .file-errors, .file > .rule, .file > .clean { margin-left:18px; margin-right:18px; }
  .file > .rule:last-child { margin-bottom:18px; }
  .toolbar { display:flex; gap:10px; align-items:center; margin:10px 0 4px; }
  .toolbar button { font:inherit; font-size:13px; padding:5px 12px; border:1px solid var(--border);
    background:var(--card); color:var(--fg); border-radius:7px; cursor:pointer; }
  .toolbar button:hover { border-color:var(--accent); color:var(--accent); }
  .toolbar button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .status { font-size:12px; font-weight:700; padding:2px 8px; border-radius:999px; }
  .status.ok { background:color-mix(in srgb,var(--ok) 18%,transparent); color:var(--ok); }
  .status.bad { background:color-mix(in srgb,var(--bad) 18%,transparent); color:var(--bad); }
  .meta { color:var(--muted); font-size:13px; margin:0 0 12px; }
  .file-errors { background:color-mix(in srgb,var(--bad) 8%,transparent); border-radius:8px;
    padding:8px 14px; margin:10px 0; font-size:14px; }
  .file-errors ul { margin:6px 0 0; padding-left:18px; }
  .rule { background:var(--card); border:1px solid var(--border); border-radius:9px;
    padding:12px 14px; margin:10px 0; }
  .rule.error { border-left:3px solid var(--bad); }
  .rule.warn { border-left:3px solid var(--warn); }
  .rule.info { border-left:3px solid var(--muted); }
  .rule-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .rule-title { font-weight:600; }
  .count { color:var(--muted); font-size:13px; margin-left:auto; }
  .badge { font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px;
    border:1px solid var(--border); }
  .pill { font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:5px;
    letter-spacing:.03em; text-transform:uppercase; white-space:nowrap; }
  .pill.block { background:var(--bad); color:#fff; }
  .pill.warn { background:color-mix(in srgb,var(--warn) 22%,transparent); color:var(--warn);
    border:1px solid color-mix(in srgb,var(--warn) 45%,transparent); }
  .pill.info { background:color-mix(in srgb,var(--muted) 18%,transparent); color:var(--muted); }
  .reason { font-size:13px; margin:0 0 12px; font-weight:600; }
  .reason.bad { color:var(--bad); }
  .reason.ok { color:var(--ok); }
  .b-formato { background:color-mix(in srgb,var(--accent) 15%,transparent); color:var(--accent); }
  .b-contenido { background:color-mix(in srgb,var(--bad) 12%,transparent); color:var(--bad); }
  .b-revisar { background:color-mix(in srgb,var(--warn) 15%,transparent); color:var(--warn); }
  .b-nuestro { background:color-mix(in srgb,var(--ok) 15%,transparent); color:var(--ok); }
  .why,.fix { margin:6px 0 0; font-size:14px; }
  details { margin-top:8px; }
  summary { cursor:pointer; color:var(--accent); font-size:13px; }
  ul.ex { margin:8px 0 0; padding-left:18px; font-size:13px; color:var(--muted); }
  ul.ex .loc { color:var(--fg); font-weight:600; }
  ul.ex .more { list-style:none; font-style:italic; }
  .clean { color:var(--muted); font-style:italic; }
  footer { margin-top:48px; color:var(--muted); font-size:12px; border-top:1px solid var(--border); padding-top:16px; }
`

const body = `
<div class="wrap">
  <h1>Informe de validación de datos</h1>
  <p class="sub">Base por país del repositorio · ${totalFiles} archivos · generado ${now}</p>

  <div class="cards">
    <div class="stat"><div class="n">${totalFiles}</div><div class="l">archivos</div></div>
    <div class="stat"><div class="n">${totalRows.toLocaleString('es')}</div><div class="l">filas</div></div>
    <div class="stat ok"><div class="n">${passedCount}</div><div class="l">aceptados</div></div>
    <div class="stat bad"><div class="n">${failed}</div><div class="l">rechazados</div></div>
    <div class="stat"><div class="n">${totalCuraciones.toLocaleString('es')}</div><div class="l">curaciones auto</div></div>
  </div>

  <div class="callout">
    <strong>Cómo leer esto.</strong> Cada observación es <span class="pill block">Bloqueante</span>
    o <span class="pill warn">Aviso</span>. Un archivo se <strong>rechaza del pipeline</strong> si
    tiene algún <em>problema de archivo</em> (basta uno) o si demasiadas filas tienen un error
    bloqueante (umbral: 95% de filas válidas). Los <strong>avisos</strong> no botan el archivo, son
    cosas a revisar. La categoría (<span class="badge b-formato">Formato</span>,
    <span class="badge b-contenido">Contenido</span>,
    <span class="badge b-nuestro">Lo resolvemos nosotros</span>) dice de qué tipo es el arreglo, no
    si bloquea.
  </div>
  <div class="callout">
    <strong>Curación automática activa.</strong> El validador ahora arregla de nuestro lado los
    problemas de <strong>formato</strong> que son deterministas y sin pérdida: el apóstrofe en
    <code>COUNTRY_ISO_NUM</code>, el país en MAYÚSCULAS y el nombre de archivo en minúscula. Por eso
    <strong>${passedCount} de ${totalFiles} archivos pasan</strong> sin que tengas que tocar nada.
    Lo que queda rechazado es de <strong>Contenido</strong> real (sector no canónico, tipo de
    proyecto en inglés) — casi todo en los países en incorporación. Cada arreglo que hicimos aparece
    listado por archivo, no se esconde.
  </div>

  ${
    sectorConflicts.length
      ? `<div class="pending">
    <h2 style="border:0;margin-top:8px">⚠ Pendiente para revisar: sector en conflicto (Area_EN ≠ Area_ES)</h2>
    <p>No es un problema de formato. En estas inversiones las dos columnas de sector apuntan a
    categorías <strong>conceptualmente distintas</strong>: una de las dos está mal y no se puede
    saber cuál sin criterio del equipo. Por eso, aunque dejemos de exigir el formato de
    <code>Area_ES</code>, conviene resolver estos casos en origen.</p>
    <div class="overflow"><table>
      <thead><tr><th>Archivo</th><th>Id</th><th>Area_EN</th><th>Area_ES</th><th>Inversor</th></tr></thead>
      <tbody>${sectorConflicts
        .sort((a, b) => Number(b.grave) - Number(a.grave))
        .map(
          (c) =>
            `<tr class="${c.grave ? 'grave' : ''}"><td>${esc(c.file)}</td><td>${esc(c.id)}</td><td>${esc(c.en)}</td><td>${esc(c.es)}</td><td>${esc(c.investor)}</td></tr>`
        )
        .join('')}</tbody>
    </table></div>
    <p class="note">Filas resaltadas = país que ya está en la base (sector real en conflicto). El
    resto son países en incorporación con <code>Area_EN=Construction</code> como marcador
    provisional.</p>
  </div>`
      : ''
  }

  ${
    onboarding.length
      ? `<div class="onboarding">
    <h2 style="border:0;margin-top:8px">Países en incorporación</h2>
    <p>Estos países están reconocidos pero todavía no entran al mapa. Para incorporarse necesitan
    dos cosas: la <strong>geometría de borde</strong> (la cargamos nosotros) y el <strong>archivo de
    datos sin errores bloqueantes</strong>. Cuando ambas estén ✓, el país entra automáticamente.</p>
    ${onboarding
      .map(
        (o) => `<div class="onb-card">
        <div class="onb-name">${esc(o.name.replace(/\.xlsx$/, ''))}</div>
        <div class="onb-gate"><span class="box">${o.hasBorder ? '✓' : '☐'}</span> Geometría de país ${o.hasBorder ? '' : '<span class="muted">— falta el borde (lo cargamos nosotros)</span>'}</div>
        <div class="onb-gate"><span class="box">${o.blocking === 0 ? '✓' : '☐'}</span> Datos sin bloqueantes ${o.blocking === 0 ? '' : `<span class="muted">— ${o.blocking} pendiente(s)${o.tipos.length ? ': ' + esc(o.tipos.join(', ')) : ''}</span>`}</div>
      </div>`
      )
      .join('')}
  </div>`
      : ''
  }

  <h2>Resumen por tipo de observación</h2>
  <div class="overflow">
  <table>
    <thead><tr><th>Bloqueante</th><th>Observación</th><th>Categoría</th><th class="num"># países</th><th class="num">Casos</th></tr></thead>
    <tbody>${globalRows}</tbody>
  </table>
  </div>

  <h2>Detalle por archivo</h2>
  <p class="sub">Cada país está colapsado. El encabezado muestra cuántos <em>tipos</em> de observación tiene, por categoría. Abrí el que quieras ver en detalle.</p>
  <div class="toolbar">
    <button type="button" onclick="document.querySelectorAll('details.file').forEach(d=>d.open=true)">Expandir todo</button>
    <button type="button" onclick="document.querySelectorAll('details.file').forEach(d=>d.open=false)">Colapsar todo</button>
  </div>
  ${results.map(fileSection).join('')}

  <footer>
    Informe de validación generado automáticamente al subir los datos. Verde = el país entra al
    mapa; rojo = revisar los puntos marcados y volver a subir.
  </footer>
</div>`

const html = fragment
  ? `<style>${style}</style>${body}`
  : `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe de validación de datos</title><style>${style}</style></head><body>${body}</body></html>`

const dest = outPath ? resolve(process.cwd(), outPath) : resolve(__dirname, '..', 'validation_report.html')
writeFileSync(dest, html, 'utf8')
console.log(`Informe: ${dest}`)
console.log(`Archivos: ${totalFiles} · con observaciones: ${failed} · filas: ${totalRows}`)
